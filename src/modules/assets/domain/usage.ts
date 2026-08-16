/**
 * Operational material / equipment usage - attribution only.
 *
 * Cost recognition audit (V1 / next-gen):
 * - Purchase Actual is recognized once via Expense finalize and/or posted AP vendor bills.
 * - Inventory movements update quantity_on_hand only (never Expense / GL / Actual).
 * - Material usage and equipment usage NEVER create Actual, Expense, Committed, or Forecast.
 * - Do not invent inventory costing (FIFO/AVG/standard) or capitalize usage into project cost.
 * - Doc 21 “issue → project material cost” is future planning and is overridden here.
 *
 * Low stock: use inventory reorder_level / getReorderStatus - operational indicator only.
 */

/** Material consumption is never recognized Actual cost. */
export function isMaterialUsageRecognizedActual(): false {
  return false;
}

/** Equipment / vehicle usage assignment is never recognized Actual cost. */
export function isEquipmentUsageRecognizedActual(): false {
  return false;
}

/** Usage must not invent a second purchase Actual (purchase already stays once). */
export function doesUsageCreatePurchaseActual(): false {
  return false;
}

/**
 * At least one of hours / days / mileage should be present for equipment usage.
 * Dates alone are allowed for simple “used on site” attribution.
 */
export function hasEquipmentUsageMetric(input: {
  readonly hours?: string | null;
  readonly days?: string | null;
  readonly mileage?: string | null;
}): boolean {
  const has = (value: string | null | undefined) =>
    Boolean(value?.trim()) && Number(value) > 0;
  return has(input.hours) || has(input.days) || has(input.mileage);
}

export function assertUsageDateRange(usageDate: string, endDate: string | null | undefined): void {
  if (!endDate) return;
  if (endDate < usageDate) {
    throw new Error('Equipment usage end date must be on or after start date');
  }
}
