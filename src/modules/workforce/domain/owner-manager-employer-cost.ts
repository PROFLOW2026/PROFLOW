import { calculateUnitEmployerCostPool } from './employer-cost-pool';
import type { RateUnit } from './types';
import type { MoneyValue } from '@/shared/money';

/** Gate A OD-36 — owner/manager default compensation (full month employer cost = 27,000 ILS). */
export const OWNER_MANAGER_DEFAULT_BASE_RATE = '18000';
export const OWNER_MANAGER_DEFAULT_BURDEN_PERCENT = '50';
export const OWNER_MANAGER_DEFAULT_WORKING_DAYS_PER_MONTH = '22';

export interface OwnerManagerCreateCompensationDefaults {
  readonly rateUnit: RateUnit;
  readonly baseRate: string;
  readonly burdenPercent: string;
  readonly workingDaysPerMonth: string;
  readonly defaultLaborAllocationIntent: 'company_only';
  readonly currency: string;
}

export function resolveOwnerManagerCreateCompensationDefaults(
  currency: string,
): OwnerManagerCreateCompensationDefaults {
  return {
    rateUnit: 'monthly',
    baseRate: OWNER_MANAGER_DEFAULT_BASE_RATE,
    burdenPercent: OWNER_MANAGER_DEFAULT_BURDEN_PERCENT,
    workingDaysPerMonth: OWNER_MANAGER_DEFAULT_WORKING_DAYS_PER_MONTH,
    defaultLaborAllocationIntent: 'company_only',
    currency: currency.toUpperCase(),
  };
}

export function computeOwnerManagerFullMonthEmployerCost(currency: string): MoneyValue {
  return calculateUnitEmployerCostPool({
    baseRate: OWNER_MANAGER_DEFAULT_BASE_RATE,
    currency: currency.toUpperCase(),
    burdenPercent: OWNER_MANAGER_DEFAULT_BURDEN_PERCENT,
  }).total;
}

export function isOwnerManagerDefaultRateTerms(input: {
  readonly rateUnit?: RateUnit | string | null;
  readonly baseRate?: string | null;
  readonly burdenPercent?: string | null;
}): boolean {
  if (input.rateUnit !== 'monthly') return false;
  const base = input.baseRate?.trim();
  const burden = input.burdenPercent?.trim();
  return base === OWNER_MANAGER_DEFAULT_BASE_RATE && burden === OWNER_MANAGER_DEFAULT_BURDEN_PERCENT;
}
