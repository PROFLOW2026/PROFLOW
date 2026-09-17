const YEAR_MONTH_REGEX = /^(\d{4})-(\d{2})$/;

/** Canonical report month id: `YYYY-MM`. */
export function isYearMonth(value: string): boolean {
  const match = YEAR_MONTH_REGEX.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function parseYearMonth(value: string): { readonly year: number; readonly month: number } | null {
  const match = YEAR_MONTH_REGEX.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Compact numeric display for month pickers: `M/YY` (e.g. `9/26`, `1/26`). */
export function formatYearMonthCompact(value: string): string {
  const match = YEAR_MONTH_REGEX.exec(value);
  if (!match) {
    throw new Error(`Invalid year-month: "${value}" (expected YYYY-MM)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month in year-month: "${value}"`);
  }
  const yy = String(year % 100);
  return `${month}/${yy}`;
}

export function yearMonthFromParts(year: number, month: number): string {
  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }
  if (!Number.isInteger(year)) {
    throw new Error(`Invalid year: ${year}`);
  }
  return `${year}-${String(month).padStart(2, '0')}`;
}

export interface MonthSelectOption {
  readonly value: string;
  readonly label: string;
}

/** Month numbers 1–12 for compact month selectors. */
export function listMonthSelectOptions(): readonly MonthSelectOption[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return { value: String(month), label: String(month) };
  });
}
