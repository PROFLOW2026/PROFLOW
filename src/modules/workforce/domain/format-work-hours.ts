import Decimal from 'decimal.js';
import { formatDecimalDisplay } from '@/shared/number/display';

/**
 * User-facing workforce hours. Storage stays numeric(18,6); the screen always
 * shows two fraction digits. Negatives and blanks stay a zero display.
 * Examples: 8.000000 → "8.00", 7.500000 → "7.50", 2.250000 → "2.25"
 */
export function formatWorkHoursValue(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return formatDecimalDisplay(0);
  let value: Decimal;
  try {
    value = new Decimal(raw);
  } catch {
    return formatDecimalDisplay(0);
  }
  if (!value.isFinite() || value.isNegative()) return formatDecimalDisplay(0);
  return formatDecimalDisplay(value.toString());
}

/** Locale-neutral hours label: "{value} hours" pattern uses the formatted value only. */
export function formatWorkHoursForDisplay(raw: string | number | null | undefined): string {
  return formatWorkHoursValue(raw);
}
