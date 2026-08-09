import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import {
  addMonths,
  businessDate,
  endOfMonth,
  maxBusinessDate,
  minBusinessDate,
  startOfMonth,
  type BusinessDate,
} from '@/shared/dates';
import {
  addMoney,
  displayScaleFor,
  money,
  moneyEquals,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import type { AllocationPeriod } from './allocation-eligibility';
import type { AllocationScheduleMode, ResolvedAllocationLine, WeightAllocationMethod } from './types';

export const ALLOCATION_SCHEDULE_MODES: readonly AllocationScheduleMode[] = [
  'one_time',
  'monthly',
  'annual',
  'custom',
] as const;

export function isAllocationScheduleMode(value: string): value is AllocationScheduleMode {
  return (ALLOCATION_SCHEDULE_MODES as readonly string[]).includes(value);
}

export interface AllocationSliceWindow {
  readonly sliceIndex: number;
  readonly periodStart: BusinessDate;
  readonly periodEnd: BusinessDate;
}

export interface AllocationSlice extends AllocationSliceWindow {
  readonly amount: MoneyValue;
}

export interface FrozenSliceAllocation {
  readonly sliceIndex: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly amount: MoneyValue;
  readonly lines: readonly ResolvedAllocationLine[];
  readonly method: WeightAllocationMethod;
  readonly totalBasis: string;
  readonly basisUnit: 'money' | 'hours' | 'count';
  readonly eligibleProjectIds: readonly string[];
}

/**
 * Calendar-month windows clipped to the source period (inclusive).
 * Mid-period starts/ends produce a shorter first/last window; money is still
 * split evenly across windows (not day-weighted) for V1.
 */
export function enumerateCalendarMonthWindows(
  period: AllocationPeriod,
): AllocationSliceWindow[] {
  if (period.start > period.end) {
    throw new DomainRuleError(
      'Allocation period start must be on or before end',
      'expenses.errors.allocationPeriodInvalid',
    );
  }

  const windows: AllocationSliceWindow[] = [];
  let cursor = startOfMonth(period.start);
  let index = 0;

  while (cursor <= period.end) {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    const sliceStart = maxBusinessDate(period.start, monthStart);
    const sliceEnd = minBusinessDate(period.end, monthEnd);
    if (sliceStart <= sliceEnd) {
      windows.push({
        sliceIndex: index,
        periodStart: sliceStart,
        periodEnd: sliceEnd,
      });
      index += 1;
    }
    cursor = addMonths(monthStart, 1);
  }

  return windows;
}

/**
 * Builds schedule slices for a source NET amount.
 *
 * - `one_time`: single window = full period, full amount
 * - `monthly` / `annual` / `custom`: one window per overlapping calendar month;
 *   amounts split evenly with deterministic residue on the last slice
 */
export function buildAllocationSlices(input: {
  readonly sourceNet: MoneyValue;
  readonly scheduleMode: AllocationScheduleMode;
  readonly periodStart: BusinessDate | string;
  readonly periodEnd: BusinessDate | string;
}): AllocationSlice[] {
  const period: AllocationPeriod = {
    start: businessDate(input.periodStart),
    end: businessDate(input.periodEnd),
  };

  if (period.start > period.end) {
    throw new DomainRuleError(
      'Allocation period start must be on or before end',
      'expenses.errors.allocationPeriodInvalid',
    );
  }

  if (input.scheduleMode === 'one_time') {
    return [
      {
        sliceIndex: 0,
        periodStart: period.start,
        periodEnd: period.end,
        amount: input.sourceNet,
      },
    ];
  }

  const windows = enumerateCalendarMonthWindows(period);
  if (windows.length === 0) {
    throw new DomainRuleError(
      'No allocation slices in the period',
      'expenses.errors.allocationNoSlices',
    );
  }

  const amounts = splitSourceNetAcrossSlices(input.sourceNet, windows.length);
  return windows.map((window, index) => ({
    ...window,
    amount: amounts[index]!,
  }));
}

/**
 * Even split of source NET across N slices. Display-scale rounded; residue on
 * the last slice so SUM(slices) = source NET exactly.
 */
export function splitSourceNetAcrossSlices(
  sourceNet: MoneyValue,
  sliceCount: number,
): MoneyValue[] {
  if (!Number.isInteger(sliceCount) || sliceCount <= 0) {
    throw new DomainRuleError(
      'Slice count must be a positive integer',
      'expenses.errors.allocationSliceCountInvalid',
    );
  }

  if (sliceCount === 1) return [sourceNet];

  const scale = displayScaleFor(sourceNet.currency);
  const amounts: MoneyValue[] = [];
  let allocated = money('0', sourceNet.currency);
  const equalShare = roundMoney(
    money(toDecimalValue(sourceNet).dividedBy(sliceCount), sourceNet.currency),
    scale,
  );

  for (let index = 0; index < sliceCount; index += 1) {
    if (index === sliceCount - 1) {
      amounts.push(subtractMoney(sourceNet, allocated));
      break;
    }
    amounts.push(equalShare);
    allocated = addMoney(allocated, equalShare);
  }

  const total = sumMoney(amounts, sourceNet.currency);
  if (!moneyEquals(total, sourceNet)) {
    throw new DomainRuleError(
      `Slice amounts must sum to ${sourceNet.amount}, received ${total.amount}`,
      'expenses.errors.allocationSliceSumMismatch',
    );
  }

  return amounts;
}

/**
 * Merges per-slice project lines into one line per project. SUM = source NET.
 * Residue (if any float noise) lands on the last project id.
 */
export function aggregateSliceAllocationLines(input: {
  readonly sourceNet: MoneyValue;
  readonly sliceLines: readonly (readonly ResolvedAllocationLine[])[];
  readonly method: WeightAllocationMethod;
  readonly costCategoryId?: string | null;
}): ResolvedAllocationLine[] {
  const byProject = new Map<
    string,
    { amount: MoneyValue; costCategoryId: string | null }
  >();

  for (const lines of input.sliceLines) {
    for (const line of lines) {
      if (line.targetType !== 'project' || !line.projectId) continue;
      const existing = byProject.get(line.projectId);
      if (!existing) {
        byProject.set(line.projectId, {
          amount: line.amount,
          costCategoryId: line.costCategoryId ?? input.costCategoryId ?? null,
        });
      } else {
        byProject.set(line.projectId, {
          amount: addMoney(existing.amount, line.amount),
          costCategoryId: existing.costCategoryId ?? line.costCategoryId ?? null,
        });
      }
    }
  }

  const projectIds = [...byProject.keys()].sort((a, b) => a.localeCompare(b));
  if (projectIds.length === 0) {
    throw new DomainRuleError(
      'No eligible projects for allocation',
      'expenses.errors.allocationNoEligibleProjects',
    );
  }

  const amounts = projectIds.map((id) => byProject.get(id)!.amount);
  const total = sumMoney(amounts, input.sourceNet.currency);
  if (!moneyEquals(total, input.sourceNet)) {
    const residue = subtractMoney(input.sourceNet, total);
    const lastId = projectIds[projectIds.length - 1]!;
    const last = byProject.get(lastId)!;
    byProject.set(lastId, { ...last, amount: addMoney(last.amount, residue) });
  }

  return projectIds.map((projectId, index) => {
    const row = byProject.get(projectId)!;
    const percent = toDecimalValue(input.sourceNet).isZero()
      ? '0.0000'
      : toDecimalValue(row.amount).times(100).dividedBy(toDecimalValue(input.sourceNet)).toFixed(4);
    return {
      targetType: 'project' as const,
      projectId,
      workPackageId: null,
      costCategoryId: row.costCategoryId,
      method: input.method,
      amount: row.amount,
      percent,
      notes: null,
      sortOrder: index,
      amountBasis: 'net' as const,
    };
  });
}

/**
 * Pure planner: for each schedule slice, reuse a frozen applied snapshot when
 * present; otherwise mark the slice as needing a fresh weight run.
 * Changing live bases must not rewrite frozen slices.
 */
export function planSlicesWithFrozenHistory(input: {
  readonly slices: readonly AllocationSlice[];
  readonly frozen: readonly FrozenSliceAllocation[];
}): {
  readonly reusable: FrozenSliceAllocation[];
  readonly pending: AllocationSlice[];
} {
  const byIndex = new Map(input.frozen.map((row) => [row.sliceIndex, row]));
  const reusable: FrozenSliceAllocation[] = [];
  const pending: AllocationSlice[] = [];

  for (const slice of input.slices) {
    const frozen = byIndex.get(slice.sliceIndex);
    if (
      frozen &&
      frozen.periodStart === slice.periodStart &&
      frozen.periodEnd === slice.periodEnd &&
      moneyEquals(frozen.amount, slice.amount)
    ) {
      reusable.push(frozen);
    } else {
      pending.push(slice);
    }
  }

  return { reusable, pending };
}

export function assertSlicesSumToSource(
  sourceNet: MoneyValue,
  slices: readonly AllocationSlice[],
): void {
  const total = sumMoney(
    slices.map((slice) => slice.amount),
    sourceNet.currency,
  );
  if (!moneyEquals(total, sourceNet)) {
    throw new DomainRuleError(
      `Slice amounts must sum to source NET ${sourceNet.amount}`,
      'expenses.errors.allocationSliceSumMismatch',
      { expected: sourceNet.amount, actual: total.amount },
    );
  }
}

/** Default schedule when the expense does not store an explicit mode. */
export function resolveAllocationScheduleMode(
  explicit: AllocationScheduleMode | null | undefined,
): AllocationScheduleMode {
  return explicit ?? 'one_time';
}

/**
 * Maps Agent 4 category period behavior → allocation schedule mode.
 * `date_range` becomes `custom` (monthly windows within the chosen range).
 * Annual proration is an explicit expense schedule mode (not a category enum).
 */
export function scheduleModeFromCategoryPeriodBehavior(
  behavior: 'one_time' | 'monthly' | 'date_range' | null | undefined,
): AllocationScheduleMode | null {
  if (!behavior) return null;
  if (behavior === 'date_range') return 'custom';
  return behavior;
}

export function describeSliceKey(slice: AllocationSliceWindow): string {
  return `${slice.sliceIndex}:${slice.periodStart}:${slice.periodEnd}`;
}

/** Exported for tests — equal monthly share before last-slice residue. */
export function equalMonthlySharePreview(sourceNet: MoneyValue, months: number): string {
  const scale = displayScaleFor(sourceNet.currency);
  return roundMoney(
    money(new Decimal(sourceNet.amount).dividedBy(months), sourceNet.currency),
    scale,
  ).amount;
}
