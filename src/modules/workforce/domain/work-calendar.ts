import Decimal from 'decimal.js';

/** Organization-level work calendar — only explicit configured values (no silent defaults). */
export interface ExplicitWorkCalendarSettings {
  readonly standardHoursPerDay: string | null;
  readonly workingDaysPerMonth: string | null;
}

/** Resolved rates used for monthly→hourly labor costing. */
export interface WorkCalendarRates {
  readonly standardHoursPerDay: string;
  readonly standardHoursPerMonth: string;
}

export type WorkCalendarCostingMissingField = 'standardHoursPerDay' | 'workingDaysPerMonth';

export type WorkCalendarCostingResult =
  | { readonly configured: true; readonly rates: WorkCalendarRates }
  | { readonly configured: false; readonly missing: readonly WorkCalendarCostingMissingField[] };

export type DailyFrameworkResult =
  | { readonly configured: true; readonly standardHoursPerDay: string }
  | { readonly configured: false };

function parsePositive(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || Number(trimmed) <= 0) return null;
  return trimmed;
}

/** Reads org labor_cost_defaults without inventing 8×20 fallbacks. */
export function parseExplicitWorkCalendarFromLaborDefaults(raw: {
  readonly standardHoursPerDay?: string | null;
  readonly workingDaysPerMonth?: string | null;
}): ExplicitWorkCalendarSettings {
  return {
    standardHoursPerDay: parsePositive(raw.standardHoursPerDay ?? null),
    workingDaysPerMonth: parsePositive(raw.workingDaysPerMonth ?? null),
  };
}

/** Employee daily override → organization explicit daily setting. */
export function resolveStandardHoursPerDay(
  employeeStandardHoursPerDay: string | null | undefined,
  orgStandardHoursPerDay: string | null,
): string | null {
  const override = parsePositive(employeeStandardHoursPerDay ?? null);
  if (override) return override;
  return orgStandardHoursPerDay;
}

/** Deterministic monthly standard hours = daily × working days per month. */
export function resolveStandardHoursPerMonth(
  standardHoursPerDay: string,
  workingDaysPerMonth: string,
): string {
  return new Decimal(standardHoursPerDay).times(workingDaysPerMonth).toString();
}

/**
 * Authoritative monthly-cost denominator for project labor Actual.
 * Requires explicit org workingDaysPerMonth; daily from employee override or org.
 */
export function resolveWorkCalendarRatesForCosting(input: {
  readonly employeeStandardHoursPerDay?: string | null;
  readonly org: ExplicitWorkCalendarSettings;
}): WorkCalendarCostingResult {
  const missing: WorkCalendarCostingMissingField[] = [];
  const standardHoursPerDay = resolveStandardHoursPerDay(
    input.employeeStandardHoursPerDay,
    input.org.standardHoursPerDay,
  );
  if (!standardHoursPerDay) {
    missing.push('standardHoursPerDay');
  }
  if (!input.org.workingDaysPerMonth) {
    missing.push('workingDaysPerMonth');
  }
  if (missing.length > 0) {
    return { configured: false, missing };
  }

  const standardHoursPerMonth = resolveStandardHoursPerMonth(
    standardHoursPerDay!,
    input.org.workingDaysPerMonth!,
  );
  if (Number(standardHoursPerMonth) <= 0) {
    return { configured: false, missing: ['standardHoursPerDay', 'workingDaysPerMonth'] };
  }

  return {
    configured: true,
    rates: {
      standardHoursPerDay: standardHoursPerDay!,
      standardHoursPerMonth,
    },
  };
}

/** Daily overtime/excess framework — employee override → org explicit setting only. */
export function resolveDailyFrameworkHours(input: {
  readonly employeeStandardHoursPerDay?: string | null;
  readonly orgStandardHoursPerDay: string | null;
}): DailyFrameworkResult {
  const resolved = resolveStandardHoursPerDay(
    input.employeeStandardHoursPerDay,
    input.orgStandardHoursPerDay,
  );
  if (!resolved) return { configured: false };
  return { configured: true, standardHoursPerDay: resolved };
}
