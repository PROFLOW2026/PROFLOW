import {
  calculateUnitEmployerCostPool,
} from '../domain/employer-cost-pool';
import {
  calculateCompensationLaborCostTotal,
  type LaborCostResolutionKind,
} from '../domain/compensation-labor-cost';
import {
  resolveCurrentCompensationForDisplay,
  resolveRateVersionForCosting,
} from '../domain/rate-lookup';
import type { DailyFrameworkResult, WorkCalendarCostingResult } from '../domain/work-calendar';
import type { RateUnit, RateVersionRecord } from '../domain/types';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { toNumericString } from '@/shared/money';

export interface EmployeeCompensationSummary {
  readonly hasRate: boolean;
  readonly rateUnit: RateUnit | null;
  readonly baseRate: string | null;
  readonly currency: string | null;
  readonly burdenPercent: string | null;
  /** Fully loaded employer cost for one compensation unit (hour/day/month). */
  readonly employerCostPool: string | null;
  readonly validFrom: BusinessDate | null;
  readonly validTo: BusinessDate | null;
  readonly standardHoursPerDay: string | null;
  /** Whether daily hours come from employee override vs org default. */
  readonly dailyHoursSource: 'employee' | 'organization' | null;
  readonly standardHoursPerMonth: string | null;
  /** Hourly-only derived display; null for monthly (pool allocation path). */
  readonly derivedHourlyCost: string | null;
  readonly calendarConfigured: boolean;
  readonly calendarMissing: readonly string[];
  readonly costResolutionKind: LaborCostResolutionKind | null;
}

export function buildEmployeeCompensationSummary(input: {
  readonly asOf: BusinessDate;
  readonly rateVersions: readonly RateVersionRecord[];
  readonly dailyFramework: DailyFrameworkResult;
  readonly calendar: WorkCalendarCostingResult;
  readonly employeeStandardHoursPerDay?: string | null;
}): EmployeeCompensationSummary {
  const currentRate = resolveCurrentCompensationForDisplay(input.rateVersions, input.asOf);
  const calendarConfigured = input.calendar.configured;
  const calendarMissing = calendarConfigured ? [] : [...input.calendar.missing];

  let derivedHourlyCost: string | null = null;
  let employerCostPool: string | null = null;
  let costResolutionKind: LaborCostResolutionKind | null = null;
  let burdenPercent: string | null = null;

  if (currentRate) {
    burdenPercent = currentRate.burdenPercent;
    const unitPool = calculateUnitEmployerCostPool({
      baseRate: currentRate.baseRate,
      currency: currentRate.currency,
      burdenPercent: currentRate.burdenPercent,
    });
    employerCostPool = toNumericString(unitPool.total);

    if (currentRate.rateUnit === 'hourly') {
      derivedHourlyCost = employerCostPool;
      costResolutionKind = 'rate_version';
    } else if (currentRate.rateUnit === 'daily') {
      costResolutionKind = 'daily_allocation';
    } else if (currentRate.rateUnit === 'monthly') {
      costResolutionKind = 'monthly_allocation';
      // Do not show monthly÷calendar as "hourly cost" — that path is retired for Actual.
      derivedHourlyCost = null;
    }
  }

  const employeeOverride = input.employeeStandardHoursPerDay?.trim();
  const standardHoursPerDay = input.dailyFramework.configured
    ? input.dailyFramework.standardHoursPerDay
    : calendarConfigured
      ? input.calendar.rates.standardHoursPerDay
      : null;
  const dailyHoursSource: 'employee' | 'organization' | null = standardHoursPerDay
    ? employeeOverride
      ? 'employee'
      : 'organization'
    : null;

  return {
    hasRate: currentRate != null,
    rateUnit: currentRate?.rateUnit ?? null,
    baseRate: currentRate?.baseRate ?? null,
    currency: currentRate?.currency ?? null,
    burdenPercent,
    employerCostPool,
    validFrom: currentRate ? businessDate(currentRate.validFrom) : null,
    validTo: currentRate?.validTo ? businessDate(currentRate.validTo) : null,
    standardHoursPerDay,
    dailyHoursSource,
    standardHoursPerMonth: calendarConfigured ? input.calendar.rates.standardHoursPerMonth : null,
    derivedHourlyCost,
    calendarConfigured,
    calendarMissing,
    costResolutionKind,
  };
}

/** Preview hourly cost for a rate on a work date (hourly employees only). */
export function previewHourlyCostForWorkDate(input: {
  readonly workDate: BusinessDate;
  readonly rateVersions: readonly RateVersionRecord[];
  readonly calendar: WorkCalendarCostingResult;
}): string | null {
  const rate = resolveRateVersionForCosting(input.rateVersions, input.workDate);
  if (!rate || rate.rateUnit !== 'hourly') return null;
  const total = calculateCompensationLaborCostTotal({
    baseRate: rate.baseRate,
    currency: rate.currency,
    rateUnit: 'hourly',
    hours: '1',
    burdenPercent: rate.burdenPercent,
  });
  return toNumericString(total);
}
