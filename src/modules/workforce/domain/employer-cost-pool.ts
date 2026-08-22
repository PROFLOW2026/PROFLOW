/**
 * Employer-cost pools by compensation unit (monthly / daily / hourly).
 * Monthly and daily project costing use ONE unit pool — never monthly÷fixed-days.
 */

import Decimal from 'decimal.js';
import {
  fromNumericString,
  money,
  percentOfMoney,
  roundMoney,
  sumMoney,
  toDecimalValue,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import type { LaborCostComponentRecord, RateUnit } from './types';

export interface EmployerCostPoolBreakdown {
  readonly baseAmount: MoneyValue;
  readonly burdenAmount: MoneyValue;
  readonly componentAmounts: readonly MoneyValue[];
  readonly total: MoneyValue;
}

type ComponentSlice = readonly Pick<
  LaborCostComponentRecord,
  'basis' | 'amount' | 'percent' | 'currency'
>[];

/** One compensation unit (1 hour / 1 day / 1 month) fully loaded employer cost. */
export function calculateUnitEmployerCostPool(input: {
  readonly baseRate: string;
  readonly currency: string;
  readonly burdenPercent: string | null;
  readonly components?: ComponentSlice;
}): EmployerCostPoolBreakdown {
  const currency = input.currency;
  const baseAmount = money(input.baseRate, currency);
  const burdenAmount =
    input.burdenPercent && input.burdenPercent.trim() !== ''
      ? percentOfMoney(baseAmount, input.burdenPercent)
      : money('0', currency);

  const componentAmounts = (input.components ?? []).map((component) => {
    if (component.basis === 'percent') {
      return percentOfMoney(baseAmount, component.percent ?? '0');
    }
    return fromNumericString(component.amount, component.currency ?? currency) ?? money('0', currency);
  });

  const total = sumMoney([baseAmount, burdenAmount, ...componentAmounts], currency);
  return { baseAmount, burdenAmount, componentAmounts, total };
}

export interface RateSegmentForMonth {
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly baseRate: string;
  readonly currency: string;
  readonly rateUnit: RateUnit;
  readonly burdenPercent: string | null;
  readonly id: string;
  readonly components: ComponentSlice;
}

function daysInCalendarMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

/**
 * Monthly employer-cost pool for a calendar month from effective-dated monthly rates.
 * Mid-month rate changes prorate by calendar days in the month (exact conservation).
 * Non-monthly versions are ignored (hourly/daily use their own paths).
 */
export function calculateMonthlyEmployerCostPoolForMonth(input: {
  readonly yearMonth: string;
  readonly currency: string;
  readonly versions: readonly RateSegmentForMonth[];
}): {
  readonly pool: MoneyValue;
  readonly baseSalaryPool: MoneyValue;
  readonly burdenPool: MoneyValue;
  readonly usedRateVersionIds: readonly string[];
} | null {
  const daysInMonth = daysInCalendarMonth(input.yearMonth);

  const monthly = input.versions.filter((v) => v.rateUnit === 'monthly');
  if (monthly.length === 0) return null;

  // Build non-overlapping coverage by walking each calendar day to the effective version.
  const byDay = new Map<string, RateSegmentForMonth>();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${input.yearMonth}-${String(day).padStart(2, '0')}`;
    let best: RateSegmentForMonth | null = null;
    for (const version of monthly) {
      if (version.validFrom > date) continue;
      if (version.validTo != null && version.validTo < date) continue;
      if (!best || version.validFrom > best.validFrom) best = version;
    }
    if (best) byDay.set(date, best);
  }

  if (byDay.size === 0) return null;

  // Group contiguous days sharing the same version.
  const segments: { version: RateSegmentForMonth; days: number }[] = [];
  let current: RateSegmentForMonth | null = null;
  let runDays = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${input.yearMonth}-${String(day).padStart(2, '0')}`;
    const version = byDay.get(date) ?? null;
    if (!version) {
      if (current && runDays > 0) {
        segments.push({ version: current, days: runDays });
        current = null;
        runDays = 0;
      }
      continue;
    }
    if (!current || current.id !== version.id) {
      if (current && runDays > 0) segments.push({ version: current, days: runDays });
      current = version;
      runDays = 1;
    } else {
      runDays += 1;
    }
  }
  if (current && runDays > 0) segments.push({ version: current, days: runDays });

  const portionTotals: MoneyValue[] = [];
  const basePortions: MoneyValue[] = [];
  const burdenPortions: MoneyValue[] = [];
  const usedIds: string[] = [];

  for (const segment of segments) {
    const unit = calculateUnitEmployerCostPool({
      baseRate: segment.version.baseRate,
      currency: segment.version.currency || input.currency,
      burdenPercent: segment.version.burdenPercent,
      components: segment.version.components,
    });
    const weight = new Decimal(segment.days).dividedBy(daysInMonth);
    const scaledTotal = roundMoney(
      money(toDecimalValue(unit.total).times(weight).toFixed(6), input.currency),
    );
    const scaledBase = roundMoney(
      money(toDecimalValue(unit.baseAmount).times(weight).toFixed(6), input.currency),
    );
    const scaledBurden = roundMoney(
      money(toDecimalValue(unit.burdenAmount).times(weight).toFixed(6), input.currency),
    );
    portionTotals.push(scaledTotal);
    basePortions.push(scaledBase);
    burdenPortions.push(scaledBurden);
    usedIds.push(segment.version.id);
  }

  // Residue so Σ portions = weighted intent against full-month single-rate when one segment covers all days.
  let pool = sumMoney(portionTotals, input.currency);
  if (segments.length === 1 && segments[0]!.days === daysInMonth) {
    pool = calculateUnitEmployerCostPool({
      baseRate: segments[0]!.version.baseRate,
      currency: segments[0]!.version.currency || input.currency,
      burdenPercent: segments[0]!.version.burdenPercent,
      components: segments[0]!.version.components,
    }).total;
  }

  return {
    pool: roundMoney(pool),
    baseSalaryPool: roundMoney(sumMoney(basePortions, input.currency)),
    burdenPool: roundMoney(sumMoney(burdenPortions, input.currency)),
    usedRateVersionIds: [...new Set(usedIds)],
  };
}

/** Daily employer-cost pool for one worked date (one daily unit). */
export function calculateDailyEmployerCostPool(input: {
  readonly baseRate: string;
  readonly currency: string;
  readonly burdenPercent: string | null;
  readonly components?: ComponentSlice;
}): MoneyValue {
  return calculateUnitEmployerCostPool(input).total;
}

export function employerPoolToDisplay(pool: EmployerCostPoolBreakdown): {
  readonly base: string;
  readonly burden: string;
  readonly total: string;
  readonly currency: string;
} {
  return {
    base: toNumericString(pool.baseAmount),
    burden: toNumericString(pool.burdenAmount),
    total: toNumericString(pool.total),
    currency: pool.total.currency,
  };
}
