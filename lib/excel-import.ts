import * as XLSX from 'xlsx';
import { excelDateToISO, normalizeArabic, toNumber } from './helpers';

export type ParsedProject = {
  name: string;
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
  parser: 'afnan-matrix-v1';
  sheetName: string;
  project: ParsedProject;
  boqItems: ParsedBoqItem[];
  workOrders: ParsedWorkOrder[];
  sites: string[];
  warnings: string[];
  rawRows: unknown[][];
};

const str = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const numeric = (value: unknown) => toNumber(value);

function cell(rows: unknown[][], row: number, col: number) {
  return rows[row]?.[col] ?? '';
}

function findText(rows: unknown[][], phrase: string) {
  const wanted = normalizeArabic(phrase);
  for (let r = 0; r < Math.min(rows.length, 25); r += 1) {
    for (let c = 0; c < Math.min(rows[r]?.length ?? 0, 45); c += 1) {
      if (normalizeArabic(str(rows[r][c])).includes(wanted)) return { row: r, col: c };
    }
  }
  return null;
}

function cleanProjectCode(value: unknown) {
  return str(value).replace(/^.*?:/, '').trim();
}

function splitSites(value: unknown) {
  const raw = str(value)
    .replace(/[–—]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!raw) return [];
  return Array.from(new Set(raw.split('-').map(s => s.trim()).filter(Boolean)));
}

function detectDataRows(rows: unknown[][], headerRow: number) {
  const result: number[] = [];
  for (let r = headerRow + 3; r < rows.length; r += 1) {
    const itemNo = str(cell(rows, r, 0));
    const itemName = str(cell(rows, r, 1));
    if (/^\d+(?:\.\d+)?$/.test(itemNo) && itemName) result.push(r);
  }
  return result;
}

export function parseAfnanMatrixWorkbook(buffer: ArrayBuffer): SmartWorkbook {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false, raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('ملف Excel لا يحتوي على أوراق عمل.');
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });

  const orderHeader = findText(rows, 'أمر عمل رقم 01');
  const boqHeader = findText(rows, 'الرقم التسلسلي');
  if (!orderHeader || !boqHeader) {
    throw new Error('لم يتم التعرف على قالب جدول أوامر العمل الحالي. تأكد أن الملف هو جدول الكميات الأصلي للمشروع.');
  }

  const projectName = str(cell(rows, 1, 2)) || 'مشروع غير مسمى';
  const municipality = str(cell(rows, 2, 2));
  const contractorName = str(cell(rows, 3, 2));
  const code = cleanProjectCode(cell(rows, 4, 2));
  const startDate = excelDateToISO(cell(rows, 5, 4));
  const endDate = excelDateToISO(cell(rows, 5, 8));

  const dataRows = detectDataRows(rows, boqHeader.row);
  const boqItems: ParsedBoqItem[] = dataRows.map(r => ({
    rowNumber: r + 1,
    itemNo: str(cell(rows, r, 0)),
    itemName: str(cell(rows, r, 1)),
    unit: str(cell(rows, r, 2)),
    contractQuantity: numeric(cell(rows, r, 3)),
    unitPrice: numeric(cell(rows, r, 4)),
    totalPrice: numeric(cell(rows, r, 6)),
  }));

  const workOrders: ParsedWorkOrder[] = [];
  const orderTitleRow = orderHeader.row;
  const dateRow = orderTitleRow + 2;
  const siteRow = boqHeader.row + 1;
  const firstOrderColumn = orderHeader.col;

  for (let index = 0; index < 12; index += 1) {
    const col = firstOrderColumn + index * 3;
    const title = str(cell(rows, orderTitleRow, col));
    if (!title && index > 7) break;
    const numberMatch = title.match(/(?:رقم|No\.?)[^0-9]*(\d+)/i);
    const number = numberMatch?.[1]?.padStart(2, '0') || String(index + 1).padStart(2, '0');
    const start = excelDateToISO(cell(rows, dateRow, col));
    const end = excelDateToISO(cell(rows, dateRow, col + 1));
    const statusText = str(cell(rows, dateRow + 2, col + 1)) || str(cell(rows, dateRow + 1, col + 1));
    const sites = splitSites(cell(rows, siteRow, col));
    const items = dataRows.map(r => ({
      rowNumber: r + 1,
      itemNo: str(cell(rows, r, 0)),
      itemName: str(cell(rows, r, 1)),
      unit: str(cell(rows, r, 2)),
      quantity: numeric(cell(rows, r, col)),
      unitPrice: numeric(cell(rows, r, 4)),
      totalPrice: numeric(cell(rows, r, col + 1)),
      remainingAfterOrder: numeric(cell(rows, r, col + 2)),
    })).filter(item => item.quantity !== 0 || item.totalPrice !== 0);

    const hasContent = Boolean(start || end || sites.length || items.length);
    if (!hasContent) continue;
    workOrders.push({
      number,
      startDate: start,
      endDate: end,
      status: normalizeArabic(statusText).includes('انتهاء') ? 'completed' : 'approved',
      sites,
      items,
    });
  }

  const sites = Array.from(new Set(workOrders.flatMap(order => order.sites)));
  const warnings: string[] = [];
  if (!sites.length) warnings.push('لم يتم العثور على أسماء مواقع مرتبطة بأوامر العمل.');
  if (!workOrders.length) warnings.push('لم يتم العثور على أوامر عمل قابلة للاستيراد.');
  const emptyUnits = boqItems.filter(item => !item.unit).length;
  if (emptyUnits) warnings.push(`${emptyUnits} بند بدون وحدة قياس.`);
  const emptyQty = boqItems.filter(item => item.contractQuantity === 0).length;
  if (emptyQty) warnings.push(`${emptyQty} بند بكمية عقد صفرية؛ سيتم استيراده للمراجعة.`);

  return {
    parser: 'afnan-matrix-v1',
    sheetName,
    project: {
      name: projectName,
      code,
      municipality,
      contractorName,
      startDate,
      endDate,
      contractValue: boqItems.reduce((sum, item) => sum + item.totalPrice, 0),
    },
    boqItems,
    workOrders,
    sites,
    warnings,
    rawRows: rows,
  };
}
