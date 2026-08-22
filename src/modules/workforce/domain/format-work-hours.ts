import Decimal from 'decimal.js';

/**
 * User-facing workforce hours — strips DB numeric(18,6) precision.
 * Examples: 8.000000 → "8", 7.500000 → "7.5", 2.250000 → "2.25"
 */
export function formatWorkHoursValue(raw: string | number | null | undefined): string {
  if (raw == null || raw === '') return '0';
  const value = new Decimal(raw);
  if (!value.isFinite() || value.isNegative()) return '0';

  const rounded = value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  if (rounded.mod(1).isZero()) return rounded.toFixed(0);

  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** Locale-neutral hours label: "{value} hours" pattern uses the formatted value only. */
export function formatWorkHoursForDisplay(raw: string | number | null | undefined): string {
  return formatWorkHoursValue(raw);
}
