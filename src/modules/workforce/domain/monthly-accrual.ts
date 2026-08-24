/**
 * MONTHLY employee open-month accrual — derived daily unit from workingDaysPerMonth.
 * Does not apply to HOURLY or DAILY compensation.
 */

import Decimal from 'decimal.js';
import {
  addMoney,
  money,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  toNumericString,
  type MoneyValue,
} from '@/shared/money';
import { DomainRuleError } from '@/shared/errors';
import {
  allocateConservedAmountByHours,
  NON_PROJECT_COST_BUCKET,
  type ConservedHourAllocation,
  type HourCostBucket,
} from './conserved-hour-allocation';

export function resolveWorkingDaysPerMonthDenominator(input: {
  readonly rateVersionWorkingDaysPerMonth: string | null | undefined;
  readonly orgWorkingDaysPerMonth: string | null | undefined;
}): string | null {
  const fromRate = parsePositiveDays(input.rateVersionWorkingDaysPerMonth);
  if (fromRate) return fromRate;
  return parsePositiveDays(input.orgWorkingDaysPerMonth);
}

function parsePositiveDays(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+(\.\d{1,4})?$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0 || n > 31) return null;
  return trimmed;
}

/** Derived daily cost basis = full monthly employer cost ÷ configured working days. */
export function deriveMonthlyDailyCostBasis(input: {
  readonly fullMonthlyEmployerCost: MoneyValue;
  readonly workingDaysPerMonth: string;
}): MoneyValue {
  const days = new Decimal(input.workingDaysPerMonth);
  if (!days.isFinite() || days.lte(0)) {
    throw new DomainRuleError(
      'Working days per month required',
      'workforce.errors.workingDaysPerMonthRequired',
    );
  }
  const raw = toDecimalValue(input.fullMonthlyEmployerCost).dividedBy(days);
  return roundMoney(money(raw.toFixed(6), input.fullMonthlyEmployerCost.currency));
}

/**
 * Accrued recognized pool for an open month: min(accruedWorkDays, W) × (P / W),
 * conserved so Σ day units = recognized pool. Full month → exact full pool.
 */
export function recognizeMonthlyEmployerPoolToDate(input: {
  readonly fullMonthlyEmployerCost: MoneyValue;
  readonly workingDaysPerMonth: string;
  readonly accruedWorkDayCount: number;
  readonly recognizeFullMonth: boolean;
}): {
  readonly recognizedPool: MoneyValue;
  readonly dailyBasis: MoneyValue;
  readonly recognizedWorkDayCount: number;
} {
  const dailyBasis = deriveMonthlyDailyCostBasis({
    fullMonthlyEmployerCost: input.fullMonthlyEmployerCost,
    workingDaysPerMonth: input.workingDaysPerMonth,
  });
  const W = new Decimal(input.workingDaysPerMonth);
  const currency = input.fullMonthlyEmployerCost.currency;

  if (input.recognizeFullMonth) {
    return {
      recognizedPool: roundMoney(input.fullMonthlyEmployerCost),
      dailyBasis,
      recognizedWorkDayCount: Math.min(
        Math.max(0, input.accruedWorkDayCount),
        Math.ceil(W.toNumber()),
      ),
    };
  }

  const capped = Math.min(Math.max(0, Math.floor(input.accruedWorkDayCount)), Math.floor(W.toNumber()));
  if (capped <= 0) {
    return {
      recognizedPool: money('0', currency),
      dailyBasis,
      recognizedWorkDayCount: 0,
    };
  }

  const raw = toDecimalValue(input.fullMonthlyEmployerCost).times(capped).dividedBy(W);
  return {
    recognizedPool: roundMoney(money(raw.toFixed(6), currency)),
    dailyBasis,
    recognizedWorkDayCount: capped,
  };
}

export function listConfiguredWorkDatesInRange(input: {
  readonly fromDate: string;
  readonly toDate: string;
  readonly workWeekdays: readonly number[];
  /** Return true when the date has monthly rate coverage (and employment). */
  readonly hasCoverage: (date: string) => boolean;
}): string[] {
  if (input.fromDate > input.toDate) return [];
  const weekdays = new Set(input.workWeekdays);
  const dates: string[] = [];
  let cursor = input.fromDate;
  while (cursor <= input.toDate) {
    const jsDay = weekdayUtc(cursor);
    if (weekdays.has(jsDay) && input.hasCoverage(cursor)) {
      dates.push(cursor);
    }
    cursor = addOneUtcDay(cursor);
  }
  return dates;
}

function weekdayUtc(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

function addOneUtcDay(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

export function daysInCalendarMonth(yearMonth: string): number {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate();
}

export function monthDateBounds(yearMonth: string): { readonly fromDate: string; readonly toDate: string } {
  const last = String(daysInCalendarMonth(yearMonth)).padStart(2, '0');
  return { fromDate: `${yearMonth}-01`, toDate: `${yearMonth}-${last}` };
}

/**
 * Attribute recognized monthly cost day-by-day.
 * Day-unit amounts are conserved so Σ day units (+ intentional unworked-day
 * remainder when N < W on a full month) = recognizedPool exactly — never
 * N × round(P/W) which yields 22×443.18 = 9749.96.
 */
export function allocateMonthlyRecognizedPoolByWorkDays(input: {
  readonly recognizedPool: MoneyValue;
  readonly fullMonthlyEmployerCost: MoneyValue;
  readonly workingDaysPerMonth: string;
  /** Chronological configured work dates in scope (already coverage-filtered). */
  readonly workDates: readonly string[];
  /** Approved hours buckets per work date (project id or NON_PROJECT_COST_BUCKET). */
  readonly hoursByDate: ReadonlyMap<string, readonly HourCostBucket[]>;
}): ConservedHourAllocation & {
  readonly dayUnitCount: number;
  readonly dailyBasis: MoneyValue;
} {
  const { recognizedPool } = input;
  const currency = recognizedPool.currency;
  const W = new Decimal(input.workingDaysPerMonth);
  const dailyBasis = deriveMonthlyDailyCostBasis({
    fullMonthlyEmployerCost: input.fullMonthlyEmployerCost,
    workingDaysPerMonth: input.workingDaysPerMonth,
  });

  if (toDecimalValue(recognizedPool).isZero() || W.lte(0)) {
    return {
      ...allocateConservedAmountByHours({ knownAmount: recognizedPool, buckets: [] }),
      dayUnitCount: 0,
      dailyBasis,
    };
  }

  const maxUnits = Math.floor(W.toNumber());
  const unitDates = input.workDates.slice(0, Math.max(maxUnits, 0));
  const dayUnitCount = unitDates.length;

  if (dayUnitCount === 0) {
    return {
      ...allocateConservedAmountByHours({ knownAmount: recognizedPool, buckets: [] }),
      dayUnitCount: 0,
      dailyBasis,
    };
  }

  const isFullPool =
    toNumericString(recognizedPool) === toNumericString(input.fullMonthlyEmployerCost);

  // Full month with fewer configured workdays than W: only N/W of P sits on those
  // days; the rest stays unallocated. Otherwise the entire recognized pool is
  // conserved across the unit days (residue on the last day).
  let unitPool = recognizedPool;
  let structuralUnallocated = money('0', currency);
  if (isFullPool && dayUnitCount < maxUnits) {
    const raw = toDecimalValue(input.fullMonthlyEmployerCost)
      .times(dayUnitCount)
      .dividedBy(W);
    unitPool = roundMoney(money(raw.toFixed(6), currency));
    structuralUnallocated = subtractMoney(recognizedPool, unitPool);
  }

  const dayAmounts = conservedEqualShares(unitPool, dayUnitCount);

  const projectTotals = new Map<string, MoneyValue>();
  const basisHoursByProject = new Map<string, Decimal>();
  let nonProject = structuralUnallocated;

  for (let i = 0; i < dayUnitCount; i += 1) {
    const date = unitDates[i]!;
    const dayPool = dayAmounts[i]!;
    const buckets = input.hoursByDate.get(date) ?? [];
    const dayAlloc = allocateConservedAmountByHours({
      knownAmount: dayPool,
      buckets,
    });

    for (const line of dayAlloc.projectLines) {
      const prev = projectTotals.get(line.key) ?? money('0', currency);
      projectTotals.set(line.key, addMoney(prev, line.amount));
      const prevH = basisHoursByProject.get(line.key) ?? new Decimal(0);
      basisHoursByProject.set(line.key, prevH.plus(line.hours));
    }
    nonProject = addMoney(nonProject, dayAlloc.nonProjectOrUnallocated);
  }

  const projectKeys = [...projectTotals.keys()].sort((a, b) => a.localeCompare(b));
  let projectLines = projectKeys.map((key) => {
    const amount = projectTotals.get(key)!;
    const hours = basisHoursByProject.get(key) ?? new Decimal(0);
    const percent = toDecimalValue(recognizedPool).isZero()
      ? '0'
      : toDecimalValue(amount).times(100).dividedBy(toDecimalValue(recognizedPool)).toFixed(4);
    return {
      key,
      hours: hours.toFixed(4),
      amount: roundMoney(amount),
      percent,
    };
  });

  // Conserve project line rounding so Σ projects + nonProject = recognizedPool.
  let allocatedToProjects = projectLines.length
    ? roundMoney(sumMoney(projectLines.map((l) => l.amount), currency))
    : money('0', currency);
  let nonProjectFinal = roundMoney(nonProject);
  const check = addMoney(allocatedToProjects, nonProjectFinal);
  if (toNumericString(check) !== toNumericString(recognizedPool)) {
    const gap = subtractMoney(recognizedPool, check);
    if (projectLines.length > 0 && toDecimalValue(gap).abs().lte(1)) {
      const last = projectLines.length - 1;
      const adjusted = addMoney(projectLines[last]!.amount, gap);
      projectLines = projectLines.map((line, index) =>
        index === last ? { ...line, amount: roundMoney(adjusted) } : line,
      );
      allocatedToProjects = roundMoney(sumMoney(projectLines.map((l) => l.amount), currency));
      nonProjectFinal = subtractMoney(recognizedPool, allocatedToProjects);
    } else {
      nonProjectFinal = subtractMoney(recognizedPool, allocatedToProjects);
    }
  }

  return {
    buckets: [
      ...projectLines,
      ...(toDecimalValue(nonProjectFinal).gt(0)
        ? [
            {
              key: NON_PROJECT_COST_BUCKET,
              hours: '0',
              amount: roundMoney(nonProjectFinal),
              percent: toDecimalValue(recognizedPool).isZero()
                ? '0'
                : toDecimalValue(nonProjectFinal)
                    .times(100)
                    .dividedBy(toDecimalValue(recognizedPool))
                    .toFixed(4),
            },
          ]
        : []),
    ],
    projectLines,
    allocatedToProjects,
    nonProjectOrUnallocated: roundMoney(nonProjectFinal),
    knownAmount: recognizedPool,
    dayUnitCount,
    dailyBasis,
  };
}

/** Equal shares of total across count buckets; last bucket absorbs rounding residue. */
function conservedEqualShares(total: MoneyValue, count: number): MoneyValue[] {
  if (count <= 0) return [];
  const currency = total.currency;
  const amounts: MoneyValue[] = [];
  for (let i = 0; i < count; i += 1) {
    const raw = toDecimalValue(total).dividedBy(count);
    amounts.push(roundMoney(money(raw.toFixed(6), currency)));
  }
  const sum = sumMoney(amounts, currency);
  if (toNumericString(sum) !== toNumericString(total)) {
    amounts[count - 1] = addMoney(amounts[count - 1]!, subtractMoney(total, sum));
  }
  return amounts;
}

/** Pick working-days denominator from versions covering the month (prefer open-ended / latest). */
export function pickWorkingDaysPerMonthForMonth(input: {
  readonly yearMonth: string;
  readonly versions: readonly {
    readonly validFrom: string;
    readonly validTo: string | null;
    readonly rateUnit: string;
    readonly workingDaysPerMonth?: string | null;
  }[];
  readonly orgWorkingDaysPerMonth: string | null;
}): string | null {
  const { fromDate, toDate } = monthDateBounds(input.yearMonth);
  const monthly = input.versions.filter((v) => v.rateUnit === 'monthly');
  // Prefer the version covering the as-of end of recognition window later;
  // for denominator identity within a month, use the version covering the most days,
  // ties → latest validFrom.
  let best: { days: number; validFrom: string; workingDaysPerMonth: string | null } | null = null;
  for (const version of monthly) {
    let days = 0;
    let cursor = fromDate;
    while (cursor <= toDate) {
      if (version.validFrom <= cursor && (version.validTo == null || version.validTo >= cursor)) {
        days += 1;
      }
      cursor = addOneUtcDay(cursor);
    }
    if (days === 0) continue;
    if (
      !best ||
      days > best.days ||
      (days === best.days && version.validFrom > best.validFrom)
    ) {
      best = {
        days,
        validFrom: version.validFrom,
        workingDaysPerMonth: version.workingDaysPerMonth ?? null,
      };
    }
  }
  if (!best) return resolveWorkingDaysPerMonthDenominator({
    rateVersionWorkingDaysPerMonth: null,
    orgWorkingDaysPerMonth: input.orgWorkingDaysPerMonth,
  });
  return resolveWorkingDaysPerMonthDenominator({
    rateVersionWorkingDaysPerMonth: best.workingDaysPerMonth,
    orgWorkingDaysPerMonth: input.orgWorkingDaysPerMonth,
  });
}
