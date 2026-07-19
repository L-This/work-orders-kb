export function normalizeArabic(value: string) {
  return String(value || '')
    .trim()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ـ\u064B-\u0652]/g, '')
    .replace(/\s+/g, ' ');
}

export function toNumber(value: any) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))));
  return Number.isFinite(n) ? n : 0;
}

function datePartsToISO(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function excelDateToISO(value: any) {
  if (value === null || value === undefined || value === '') return null;

  // XLSX returns date-only cells as JavaScript Date objects. Using toISOString()
  // converts them to UTC and can subtract one day in Saudi Arabia. Preserve the
  // calendar date exactly as displayed in Excel by reading local date parts.
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return datePartsToISO(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }

  // Excel serial dates are calendar days, not timestamps. Decode the serial
  // directly instead of creating a JavaScript Date, so timezone conversion can
  // never move the calendar day backward or forward.
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel's 1900 date system includes the historical leap-year bug. This
    // conversion preserves the exact calendar date stored in the workbook.
    const wholeDays = Math.floor(value);
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + wholeDays * 86400 * 1000);
    return datePartsToISO(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return datePartsToISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const parts = s.match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
  if (!parts) return null;
  const a = Number(parts[1]);
  const b = Number(parts[2]);
  const c = Number(parts[3]);
  let year = c > 1900 ? c : a;
  const month = b;
  const day = c > 1900 ? a : c;
  if (year < 100) year += 2000;
  return datePartsToISO(year, month, day);
}

export function parseDateOnly(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
