/**
 * Authoritative labor-cost resolution by compensation unit.
 *
 * HOURLY → time-entry cost snapshot (hours × loaded hourly rate)
 * DAILY  → day-conserved allocation (filled by daily recompute; not per-entry ÷ day-hours)
 * MONTHLY → monthly pool allocation (filled by monthly recompute; NEVER ÷ workingDaysPerMonth)
 */

import Decimal from 'decimal.js';
import {
  fromNumericString,
  money,
  multiplyMoney,
  roundMoney,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import type { LaborCostComponentRecord, RateUnit } from './types';
import { calculateLaborCostTotal } from './labor-cost';
import type { WorkCalendarRates } from './work-calendar';

export interface CompensationLaborCostInput {
  readonly baseRate: string;
  readonly currency: string;
  readonly rateUnit: RateUnit;
  readonly hours: string;
  readonly burdenPercent: string | null;
  readonly components?: readonly Pick<
    LaborCostComponentRecord,
    'basis' | 'amount' | 'percent' | 'currency'
  >[];
  readonly calendar?: WorkCalendarRates;
}

/** Prefer hourly. Daily/monthly Actual use conserved pool paths — not this converter. */
export function calculateCompensationLaborCostTotal(
  input: CompensationLaborCostInput,
): MoneyValue {
  return calculateLaborCostTotal({
    baseRate: input.baseRate,
    currency: input.currency,
    rateUnit: input.rateUnit,
    hours: input.hours,
    burdenPercent: input.burdenPercent,
    components: input.components,
    calendar: input.calendar,
  });
}

/**
 * @deprecated Display-only helper. Monthly project Actual must NOT use this path.
 */
export function hourlyEmployerCostFromMonthlyTotal(input: {
  readonly monthlyEmployerCost: MoneyValue;
  readonly calendar: WorkCalendarRates;
}): MoneyValue | null {
  const monthHours = new Decimal(input.calendar.standardHoursPerMonth);
  if (!monthHours.isFinite() || monthHours.lte(0)) {
    return null;
  }
  const hourlyAmount = new Decimal(input.monthlyEmployerCost.amount).dividedBy(monthHours);
  if (!hourlyAmount.isFinite() || hourlyAmount.lte(0)) {
    return null;
  }
  return roundMoney(
    money(hourlyAmount.toFixed(6), input.monthlyEmployerCost.currency),
  );
}

/**
 * @deprecated Monthly Actual uses allocation runs — not entry-level ÷ month-hours.
 */
export function laborCostFromMonthlyEmployerTotal(input: {
  readonly monthlyEmployerCost: MoneyValue;
  readonly hours: string;
  readonly calendar: WorkCalendarRates;
}): MoneyValue | null {
  const hourly = hourlyEmployerCostFromMonthlyTotal({
    monthlyEmployerCost: input.monthlyEmployerCost,
    calendar: input.calendar,
  });
  if (!hourly) return null;
  const hours = input.hours.trim();
  if (!hours || Number(hours) <= 0) return null;
  return roundMoney(multiplyMoney(hourly, hours));
}

export function costSnapshotFromAmount(total: MoneyValue): {
  readonly costAmount: string;
  readonly costCurrency: string;
} {
  const rounded = roundMoney(total);
  return {
    costAmount: toNumericString(rounded),
    costCurrency: rounded.currency,
  };
}

export function parseKnownMonthlyEmployerCost(input: {
  readonly knownAmount: string | null | undefined;
  readonly currency: string;
}): MoneyValue | null {
  if (!input.knownAmount?.trim()) return null;
  return fromNumericString(input.knownAmount, input.currency);
}

export type LaborCostResolutionKind =
  | 'rate_version'
  | 'monthly_allocation'
  | 'daily_allocation'
  | 'monthly_employer_cost'
  | 'unresolved_missing_rate'
  | 'unresolved_missing_standard_hours'
  | 'unresolved_missing_month_cost';

export interface LaborCostResolution {
  readonly kind: LaborCostResolutionKind;
  readonly rateVersionId: string | null;
  readonly costAmount: string | null;
  readonly costCurrency: string | null;
}

export function resolveLaborCostFromCompensation(input: {
  readonly hours: string;
  readonly calendar: WorkCalendarRates | null;
  readonly rateVersion: {
    readonly id: string;
    readonly baseRate: string;
    readonly currency: string;
    readonly rateUnit: RateUnit;
    readonly burdenPercent: string | null;
  } | null;
  readonly components: readonly Pick<
    LaborCostComponentRecord,
    'basis' | 'amount' | 'percent' | 'currency'
  >[];
  readonly monthlyEmployerCost: MoneyValue | null;
}): LaborCostResolution {
  if (input.rateVersion) {
    if (input.rateVersion.rateUnit === 'monthly') {
      return {
        kind: 'monthly_allocation',
        rateVersionId: input.rateVersion.id,
        costAmount: null,
        costCurrency: null,
      };
    }

    if (input.rateVersion.rateUnit === 'daily') {
      return {
        kind: 'daily_allocation',
        rateVersionId: input.rateVersion.id,
        costAmount: null,
        costCurrency: null,
      };
    }

    const total = calculateCompensationLaborCostTotal({
      baseRate: input.rateVersion.baseRate,
      currency: input.rateVersion.currency,
      rateUnit: 'hourly',
      hours: input.hours,
      burdenPercent: input.rateVersion.burdenPercent,
      components: input.components,
    });
    const snap = costSnapshotFromAmount(total);
    return {
      kind: 'rate_version',
      rateVersionId: input.rateVersion.id,
      costAmount: snap.costAmount,
      costCurrency: snap.costCurrency,
    };
  }

  // Do not convert monthly employer pools into entry snapshots.
  void input.monthlyEmployerCost;
  void input.calendar;

  return {
    kind: 'unresolved_missing_rate',
    rateVersionId: null,
    costAmount: null,
    costCurrency: null,
  };
}
