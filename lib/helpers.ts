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

export function excelDateToISO(value: any) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return date.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  const parts = s.match(/(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})/);
  if (!parts) return null;
  let a = Number(parts[1]), b = Number(parts[2]), c = Number(parts[3]);
  let y = c > 1900 ? c : a;
  let m = b;
  let d = c > 1900 ? a : c;
  if (y < 100) y += 2000;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
