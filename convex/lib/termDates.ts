const MONTH_YEAR = /^(\d{1,2})\/(\d{2})$/;
const MONTH_DAY_YEAR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

function endOfDayUtc(year: number, monthIndex: number, day: number): number | null {
  if (monthIndex < 0 || monthIndex > 11) return null;
  const stamp = Date.UTC(year, monthIndex, day, 23, 59, 59);
  const check = new Date(stamp);
  if (check.getUTCMonth() !== monthIndex || check.getUTCDate() !== day) return null;
  return stamp;
}

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function normalizeTermEnd(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim();
  let m = MONTH_YEAR.exec(value);
  if (m) {
    const monthIndex = Number(m[1]) - 1;
    const year = 2000 + Number(m[2]);
    if (monthIndex < 0 || monthIndex > 11) return null;
    return endOfDayUtc(year, monthIndex, lastDayOfMonth(year, monthIndex));
  }
  m = MONTH_DAY_YEAR.exec(value);
  if (m) return endOfDayUtc(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  m = ISO_DAY.exec(value);
  if (m) return endOfDayUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
