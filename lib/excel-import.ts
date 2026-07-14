import * as XLSX from 'xlsx';
import { excelDateToISO, normalizeArabic, toNumber } from './helpers';

export type ParsedProject = {
  name: string;
  baseName: string;
  code: string;
  municipality: string;
  contractorName: string;
  startDate: string | null;
  endDate: string | null;
  contractValue: number;
};

export type ParsedBoqItem = {
  rowNumber: number;
  itemNo: string;
  itemName: string;
  unit: string;
  contractQuantity: number;
  unitPrice: number;
  totalPrice: number;
};

export type ParsedWorkOrder = {
  number: string;
  startDate: string | null;
  endDate: string | null;
  status: string;
  sites: string[];
  items: Array<{
    rowNumber: number;
    itemNo: string;
    itemName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    remainingAfterOrder: number;
  }>;
};

export type SmartWorkbook = {
  parser: 'work-orders-matrix-v2';
  sheetName: string;
  project: ParsedProject;
  boqItems: ParsedBoqItem[];
  workOrders: ParsedWorkOrder[];
  sites: string[];
  warnings: string[];
  rawRows: unknown[][];
};

type CellPosition = { row: number; col: number };
type OrderColumn = { number: string; col: number; title: string };

const str = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = (value: unknown) => toNumber(value);

function cell(rows: unknown[][], row: number, col: number) {
  return rows[row]?.[col] ?? '';
}

function normalized(value: unknown) {
  return normalizeArabic(str(value)).replace(/[\s\u200e\u200f]+/g, ' ').trim();
}

function findText(rows: unknown[][], phrase: string, rowLimit = 30, colLimit = 70): CellPosition | null {
  const wanted = normalized(phrase);
  for (let r = 0; r < Math.min(rows.length, rowLimit); r += 1) {
    for (let c = 0; c < Math.min(rows[r]?.length ?? 0, colLimit); c += 1) {
      if (normalized(rows[r][c]).includes(wanted)) return { row: r, col: c };
    }
  }
  return null;
}

function cleanProjectCode(value: unknown) {
  return str(value).replace(/^.*?:/, '').replace(/[\t\u200e\u200f]/g, '').trim();
}

function canonicalUnit(value: unknown) {
  const raw = str(value).replace(/²/g, '2').replace(/³/g, '3');
  const key = normalized(raw).replace(/[.\s]/g, '');
  if (!key) return '';
  if (key === 'مط' || key === 'مترطولي') return 'م.ط';
  if (key === 'م2' || key === 'مترمربع') return 'م²';
  if (key === 'م3' || key === 'مترمكعب') return 'م³';
  if (key.includes('شهر')) return 'شهر';
  if (key.includes('سنه')) return 'سنة';
  if (key.includes('عدد')) return 'عدد';
  return str(value);
}

function uniqueByNormalized(values: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const cleaned = str(value).replace(/^[-–—/،;]+|[-–—/،;]+$/g, '').trim();
    const key = normalized(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function expandNumberedSite(value: string) {
  const match = value.match(/^(.*?\D)\s*(\d+(?:\s*-\s*\d+)+)$/);
  if (!match) return [value];
  const base = match[1].trim();
  const numbers = match[2].split(/\s*-\s*/).filter(Boolean);
  return numbers.map(number => `${base} ${number}`.trim());
}

/**
 * Site cells are not perfectly standardized. Some projects use hyphens between
 * full site names, while others use slashes and numeric ranges such as
 * "حديقة التيسير 2-5-6". This parser preserves numbered garden names and only
 * treats a hyphen as a separator when it joins two textual names.
 */
function splitSites(value: unknown) {
  const raw = str(value)
    .replace(/[–—]/g, '-')
    .replace(/\r?\n/g, '/')
    .replace(/[؛;]/g, '/')
    .replace(/،/g, '/');
  if (!raw) return [];

  const slashParts = raw.split('/').map(part => part.trim()).filter(Boolean);
  const sites: string[] = [];
  for (const slashPart of slashParts) {
    const expanded = expandNumberedSite(slashPart);
    if (expanded.length > 1) {
      sites.push(...expanded);
      continue;
    }

    // A textual value on both sides means the hyphen separates site names.
    const textualParts = slashPart
      .split(/\s*-\s*(?=[\u0600-\u06FF])/)
      .map(part => part.trim())
      .filter(Boolean);
    for (const part of textualParts) {
      const numbered = expandNumberedSite(part);
      sites.push(...numbered);
    }
  }
  return uniqueByNormalized(sites);
}

function detectDataRows(rows: unknown[][], headerRow: number) {
  const result: number[] = [];
  let emptyStreak = 0;
  for (let r = headerRow + 2; r < rows.length; r += 1) {
    const itemNo = str(cell(rows, r, 0));
    const itemName = str(cell(rows, r, 1));
    if (/^\d+(?:\.\d+)?$/.test(itemNo) && itemName) {
      result.push(r);
      emptyStreak = 0;
    } else if (result.length) {
      emptyStreak += 1;
      if (emptyStreak >= 5) break;
    }
  }
  return result;
}

function detectOrderColumns(rows: unknown[][], titleRow: number) {
  const result: OrderColumn[] = [];
  const maxCols = Math.max(...rows.slice(0, 15).map(row => row.length), 0);
  for (let c = 0; c < maxCols; c += 1) {
    const title = str(cell(rows, titleRow, c));
    const key = normalized(title);
    if (!key.includes('امر عمل')) continue;
    const match = title.match(/(?:رقم|No\.?)[^0-9٠-٩]*([0-9٠-٩]+)/i);
    const rawNumber = match?.[1]?.replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
    const number = rawNumber ? rawNumber.padStart(2, '0') : String(result.length + 1).padStart(2, '0');
    result.push({ number, col: c, title });
  }
  return result;
}

function detectProjectFields(rows: unknown[][]) {
  const projectLabel = findText(rows, 'مشروع صيانة') || findText(rows, 'اسم المشروع');
  const municipalityLabel = findText(rows, 'بلدية');
  const contractorLabel = findText(rows, 'شركة');
  const codeLabel = findText(rows, 'رقم المشروع');
  const startLabel = findText(rows, 'تاريخ بداية المشروع');
  const endLabel = findText(rows, 'تاريخ نهاية المشروع');

  const baseName = projectLabel ? str(cell(rows, projectLabel.row, projectLabel.col)) : str(cell(rows, 1, 2));
  const municipality = municipalityLabel ? str(cell(rows, municipalityLabel.row, municipalityLabel.col)) : str(cell(rows, 2, 2));
  const contractorName = contractorLabel ? str(cell(rows, contractorLabel.row, contractorLabel.col)) : str(cell(rows, 3, 2));
  const code = codeLabel ? cleanProjectCode(cell(rows, codeLabel.row, codeLabel.col)) : cleanProjectCode(cell(rows, 4, 2));
  const startDate = startLabel ? excelDateToISO(cell(rows, startLabel.row, startLabel.col + 2)) : excelDateToISO(cell(rows, 5, 4));
  const endDate = endLabel ? excelDateToISO(cell(rows, endLabel.row, endLabel.col + 2)) : excelDateToISO(cell(rows, 5, 8));
  const name = municipality && !normalized(baseName).includes(normalized(municipality))
    ? `${baseName} - ${municipality}`
    : baseName;

  return { name: name || 'مشروع غير مسمى', baseName: baseName || 'مشروع غير مسمى', municipality, contractorName, code, startDate, endDate };
}

function detectBoqColumns(rows: unknown[][], headerRow: number) {
  const header = rows[headerRow] || [];
  const lookup = (phrases: string[], fallback: number) => {
    for (let c = 0; c < header.length; c += 1) {
      const key = normalized(header[c]);
      if (phrases.some(phrase => key.includes(normalized(phrase)))) return c;
    }
    return fallback;
  };
  return {
    itemNo: lookup(['الرقم التسلسلي'], 0),
    itemName: lookup(['البند'], 1),
    unit: lookup(['الوحدة'], 2),
    quantity: lookup(['الكمية'], 3),
    unitPrice: lookup(['سعر الوحدة'], 4),
    totalPrice: lookup(['إجمالي العقد من غير الضريبة', 'اجمالي العقد من غير الضريبه'], 6),
  };
}

export function parseWorkOrdersMatrixWorkbook(buffer: ArrayBuffer): SmartWorkbook {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('ملف Excel لا يحتوي على أوراق عمل.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

  const boqHeader = findText(rows, 'الرقم التسلسلي');
  if (!boqHeader) throw new Error('لم يتم العثور على رأس جدول الكميات (الرقم التسلسلي).');

  const orderTitleCell = findText(rows, 'أمر عمل رقم');
  if (!orderTitleCell) throw new Error('لم يتم العثور على أعمدة أوامر العمل في الملف.');
  const orderColumns = detectOrderColumns(rows, orderTitleCell.row);
  if (!orderColumns.length) throw new Error('تعذر تحديد أرقام أوامر العمل من الملف.');

  const projectFields = detectProjectFields(rows);
  const boqColumns = detectBoqColumns(rows, boqHeader.row);
  const dataRows = detectDataRows(rows, boqHeader.row);
  const boqItems: ParsedBoqItem[] = dataRows.map(row => ({
    rowNumber: row + 1,
    itemNo: str(cell(rows, row, boqColumns.itemNo)),
    itemName: str(cell(rows, row, boqColumns.itemName)),
    unit: canonicalUnit(cell(rows, row, boqColumns.unit)),
    contractQuantity: numeric(cell(rows, row, boqColumns.quantity)),
    unitPrice: numeric(cell(rows, row, boqColumns.unitPrice)),
    totalPrice: numeric(cell(rows, row, boqColumns.totalPrice)),
  }));

  const workOrders: ParsedWorkOrder[] = [];
  const dateRow = orderTitleCell.row + 2;
  const siteRow = boqHeader.row + 1;
  for (const orderColumn of orderColumns) {
    const col = orderColumn.col;
    const start = excelDateToISO(cell(rows, dateRow, col));
    const end = excelDateToISO(cell(rows, dateRow, col + 1));
    const statusText = [cell(rows, dateRow + 1, col + 1), cell(rows, dateRow + 2, col + 1), cell(rows, dateRow + 3, col + 1)]
      .map(str)
      .find(Boolean) || '';
    const sites = splitSites(cell(rows, siteRow, col));
    const items = dataRows.map(row => ({
      rowNumber: row + 1,
      itemNo: str(cell(rows, row, boqColumns.itemNo)),
      itemName: str(cell(rows, row, boqColumns.itemName)),
      unit: canonicalUnit(cell(rows, row, boqColumns.unit)),
      quantity: numeric(cell(rows, row, col)),
      unitPrice: numeric(cell(rows, row, boqColumns.unitPrice)),
      totalPrice: numeric(cell(rows, row, col + 1)),
      remainingAfterOrder: numeric(cell(rows, row, col + 2)),
    })).filter(item => item.quantity !== 0 || item.totalPrice !== 0);

    // Empty templates often contain calculated zeros or remaining-balance formulas.
    // Only import an order when it has a date, a site, or an actually executed line.
    const hasContent = Boolean(start || end || sites.length || items.length);
    if (!hasContent) continue;
    workOrders.push({
      number: orderColumn.number,
      startDate: start,
      endDate: end,
      status: normalized(statusText).includes('انتهاء') || normalized(statusText).includes('مكتمل') ? 'completed' : 'approved',
      sites,
      items,
    });
  }

  const sites = uniqueByNormalized(workOrders.flatMap(order => order.sites));
  const warnings: string[] = [];
  if (!sites.length) warnings.push('لم يتم العثور على أسماء مواقع مرتبطة بأوامر العمل.');
  if (!workOrders.length) warnings.push('لم يتم العثور على أوامر عمل فعلية قابلة للاستيراد.');
  const emptyUnits = boqItems.filter(item => !item.unit).length;
  if (emptyUnits) warnings.push(`${emptyUnits} بند بدون وحدة قياس.`);
  const emptyQty = boqItems.filter(item => item.contractQuantity === 0).length;
  if (emptyQty) warnings.push(`${emptyQty} بند بكمية عقد صفرية؛ سيتم استيراده للمراجعة.`);
  const blankDates = workOrders.filter(order => !order.startDate).length;
  if (blankDates) warnings.push(`${blankDates} أمر عمل يحتوي بيانات فعلية بدون تاريخ بدء.`);
  const duplicateOrderNumbers = workOrders.length - new Set(workOrders.map(order => order.number)).size;
  if (duplicateOrderNumbers) warnings.push('تم العثور على أرقام أوامر عمل مكررة داخل الملف.');
  if (findText(rows, 'تخفيض العقد') || findText(rows, 'زيادة المشروع')) {
    warnings.push('تم اكتشاف أعمدة تخفيض/زيادة للعقد. تُحفظ حاليًا كمية العقد الأساسية، ويمكن إضافة سجل مستقل للتعديلات عند الحاجة.');
  }

  return {
    parser: 'work-orders-matrix-v2',
    sheetName,
    project: {
      ...projectFields,
      contractValue: boqItems.reduce((sum, item) => sum + item.totalPrice, 0),
    },
    boqItems,
    workOrders,
    sites,
    warnings,
    rawRows: rows,
  };
}

// Backward-compatible export so older page imports continue to work.
export const parseAfnanMatrixWorkbook = parseWorkOrdersMatrixWorkbook;
