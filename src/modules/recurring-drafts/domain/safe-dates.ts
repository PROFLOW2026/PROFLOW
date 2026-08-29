import { coerceBusinessDate, type BusinessDate } from '@/shared/dates';
import { formatBusinessDate } from '@/shared/dates/format';

/** Never throws — for legacy / partial recurring draft rows in UI. */
export function safeBusinessDate(value: unknown): BusinessDate | null {
  if (value == null || value === '') return null;
  try {
    return coerceBusinessDate(value);
  } catch {
    if (typeof value === 'string') {
      const ym = value.trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
      if (ym) return `${ym[1]}-${ym[2]}-01` as BusinessDate;
    }
    return null;
  }
}

export function formatSafeBusinessDate(
  value: unknown,
  locale: string,
  fallback: string,
): string {
  const date = safeBusinessDate(value);
  if (!date) return fallback;
  try {
    return formatBusinessDate(date, locale);
  } catch {
    return fallback;
  }
}

export function safeYearMonthLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(trimmed)) return trimmed;
  const date = safeBusinessDate(trimmed);
  if (!date) return fallback;
  return date.slice(0, 7);
}
