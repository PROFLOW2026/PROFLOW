/**
 * Pure monthly employer-cost allocation amount resolution.
 *
 * Conservation: known = Σ project line amounts + unallocated (visible remainder).
 * Weight methods (hours|days) distribute 100% of known across lines (residue on last).
 * percent / fixed_amount leave under-allocation as unallocated; over-allocation rejects.
 */

import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  money,
  moneyEquals,
  percentOfMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import type { MonthlyAllocationMethod } from './monthly-cost-gates';

export interface MonthlyAllocationLineInput {
  readonly projectId: string;
  readonly hours?: string | null;
  readonly days?: string | null;
  readonly percent?: string | null;
  readonly amount?: string | null;
  readonly notes?: string | null;
}

export interface ResolvedMonthlyAllocationLine {
  readonly projectId: string;
  readonly amount: MoneyValue;
  readonly percent: string | null;
  readonly basisHours: string | null;
  readonly basisDays: string | null;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface MonthlyAllocationResolution {
  readonly lines: readonly ResolvedMonthlyAllocationLine[];
  readonly allocatedAmount: MoneyValue;
  readonly unallocatedAmount: MoneyValue;
}

function parseNonNegative(value: string | null | undefined, label: string): Decimal {
  if (value == null || value.trim() === '') {
    throw new DomainRuleError(`${label} is required`, 'workforce.errors.allocationBasisRequired');
  }
  const parsed = new Decimal(value.trim());
  if (!parsed.isFinite() || parsed.isNegative()) {
    throw new DomainRuleError(`Invalid ${label}`, 'workforce.errors.allocationBasisInvalid');
  }
  return parsed;
}

/**
 * Resolves draft allocation line amounts for a known employer-cost total.
 * Does not persist; does not claim Actual.
 */
export function resolveMonthlyAllocationAmounts(input: {
  readonly knownAmount: MoneyValue;
  readonly method: MonthlyAllocationMethod;
  readonly lines: readonly MonthlyAllocationLineInput[];
}): MonthlyAllocationResolution {
  const { knownAmount, method, lines } = input;
  if (lines.length === 0) {
    return {
      lines: [],
      allocatedAmount: money('0', knownAmount.currency),
      unallocatedAmount: knownAmount,
    };
  }

  const projectIds = new Set<string>();
  for (const line of lines) {
    if (!line.projectId?.trim()) {
      throw new DomainRuleError('Project is required', 'workforce.errors.allocationProjectRequired');
    }
    if (projectIds.has(line.projectId)) {
      throw new DomainRuleError(
        'Duplicate project in allocation lines',
        'workforce.errors.allocationDuplicateProject',
      );
    }
    projectIds.add(line.projectId);
  }

  if (method === 'hours' || method === 'days') {
    return resolveByWeights(knownAmount, method, lines);
  }
  if (method === 'percent') {
    return resolveByPercent(knownAmount, lines);
  }
  return resolveByFixedAmount(knownAmount, lines);
}

function resolveByWeights(
  knownAmount: MoneyValue,
  method: 'hours' | 'days',
  lines: readonly MonthlyAllocationLineInput[],
): MonthlyAllocationResolution {
  const bases = lines.map((line) => {
    const raw =
      method === 'hours'
        ? parseNonNegative(line.hours, 'hours')
        : parseNonNegative(line.days, 'days');
    return { line, basis: raw };
  });

  const totalBasis = bases.reduce((sum, row) => sum.plus(row.basis), new Decimal(0));
  if (totalBasis.isZero()) {
    throw new DomainRuleError(
      'Allocation weights must be greater than zero',
      'workforce.errors.allocationWeightsRequired',
    );
  }

  const sorted = bases
    .slice()
    .sort((a, b) => a.line.projectId.localeCompare(b.line.projectId));

  const amounts: MoneyValue[] = sorted.map((row) => {
    const raw = toDecimalValue(knownAmount).times(row.basis).dividedBy(totalBasis);
    return roundMoney(money(raw.toFixed(6), knownAmount.currency));
  });

  // Residue on last (deterministic id sort) so Σ lines = known.
  const total = sumMoney(amounts, knownAmount.currency);
  if (!moneyEquals(total, knownAmount)) {
    const residue = subtractMoney(knownAmount, total);
    const last = amounts.length - 1;
    amounts[last] = addMoney(amounts[last]!, residue);
  }

  const resolved: ResolvedMonthlyAllocationLine[] = sorted.map((row, index) => {
    const amount = amounts[index]!;
    const percent = toDecimalValue(knownAmount).isZero()
      ? '0'
      : toDecimalValue(amount).times(100).dividedBy(toDecimalValue(knownAmount)).toFixed(4);
    return {
      projectId: row.line.projectId,
      amount,
      percent,
      basisHours: method === 'hours' ? row.basis.toFixed(6) : null,
      basisDays: method === 'days' ? row.basis.toFixed(4) : null,
      notes: row.line.notes ?? null,
      sortOrder: index,
    };
  });

  return {
    lines: resolved.filter((line) => toDecimalValue(line.amount).greaterThan(0)),
    allocatedAmount: knownAmount,
    unallocatedAmount: money('0', knownAmount.currency),
  };
}

function resolveByPercent(
  knownAmount: MoneyValue,
  lines: readonly MonthlyAllocationLineInput[],
): MonthlyAllocationResolution {
  let percentTotal = new Decimal(0);
  const resolvedAmounts: MoneyValue[] = [];

  for (const line of lines) {
    const pct = parseNonNegative(line.percent, 'percent');
    if (pct.greaterThan(100)) {
      throw new DomainRuleError(
        'Allocation percent cannot exceed 100',
        'workforce.errors.allocationPercentRange',
      );
    }
    percentTotal = percentTotal.plus(pct);
    resolvedAmounts.push(percentOfMoney(knownAmount, pct.toString()));
  }

  if (percentTotal.greaterThan(100)) {
    throw new DomainRuleError(
      'Allocation percents cannot exceed 100%',
      'workforce.errors.allocationPercentOver',
    );
  }

  const allocated = sumMoney(resolvedAmounts, knownAmount.currency);
  if (toDecimalValue(allocated).greaterThan(toDecimalValue(knownAmount))) {
    throw new DomainRuleError(
      'Allocated amount exceeds known employer cost',
      'workforce.errors.allocationOverKnown',
    );
  }

  const unallocated = subtractMoney(knownAmount, allocated);
  const resolved: ResolvedMonthlyAllocationLine[] = lines.map((line, index) => ({
    projectId: line.projectId,
    amount: resolvedAmounts[index]!,
    percent: parseNonNegative(line.percent, 'percent').toFixed(4),
    basisHours: null,
    basisDays: null,
    notes: line.notes ?? null,
    sortOrder: index,
  }));

  return {
    lines: resolved.filter((line) => toDecimalValue(line.amount).greaterThan(0)),
    allocatedAmount: allocated,
    unallocatedAmount: unallocated,
  };
}

function resolveByFixedAmount(
  knownAmount: MoneyValue,
  lines: readonly MonthlyAllocationLineInput[],
): MonthlyAllocationResolution {
  const resolvedAmounts: MoneyValue[] = [];

  for (const line of lines) {
    if (!line.amount?.trim()) {
      throw new DomainRuleError(
        'Allocation amount is required',
        'workforce.errors.allocationAmountRequired',
      );
    }
    const amount = money(line.amount, knownAmount.currency);
    if (toDecimalValue(amount).lessThanOrEqualTo(0)) {
      throw new DomainRuleError(
        'Allocation amount must be positive',
        'workforce.errors.allocationAmountPositive',
      );
    }
    resolvedAmounts.push(amount);
  }

  const allocated = sumMoney(resolvedAmounts, knownAmount.currency);
  if (toDecimalValue(allocated).greaterThan(toDecimalValue(knownAmount))) {
    throw new DomainRuleError(
      'Allocated amount exceeds known employer cost',
      'workforce.errors.allocationOverKnown',
    );
  }

  const unallocated = subtractMoney(knownAmount, allocated);
  const resolved: ResolvedMonthlyAllocationLine[] = lines.map((line, index) => {
    const amount = resolvedAmounts[index]!;
    const percent = toDecimalValue(knownAmount).isZero()
      ? null
      : toDecimalValue(amount).times(100).dividedBy(toDecimalValue(knownAmount)).toFixed(4);
    return {
      projectId: line.projectId,
      amount,
      percent,
      basisHours: null,
      basisDays: null,
      notes: line.notes ?? null,
      sortOrder: index,
    };
  });

  return {
    lines: resolved,
    allocatedAmount: allocated,
    unallocatedAmount: unallocated,
  };
}

/** Derive known employer cost from estimated/actual draft fields (actual wins when > 0). */
export function deriveKnownEmployerCost(input: {
  readonly estimatedAmount?: string | null;
  readonly actualAmount?: string | null;
  readonly currency: string;
}): {
  readonly knownAmount: MoneyValue;
  readonly knownQuality: 'estimated' | 'actual';
  readonly estimatedAmount: string | null;
  readonly actualAmount: string | null;
} {
  const estimatedRaw = input.estimatedAmount?.trim() || null;
  const actualRaw = input.actualAmount?.trim() || null;
  const actualNum = actualRaw ? Number(actualRaw) : 0;
  const useActual = Boolean(actualRaw) && actualNum > 0;

  if (useActual) {
    return {
      knownAmount: money(actualRaw!, input.currency),
      knownQuality: 'actual',
      estimatedAmount: estimatedRaw,
      actualAmount: actualRaw,
    };
  }

  if (!estimatedRaw) {
    throw new DomainRuleError(
      'Estimated or actual employer cost is required',
      'workforce.errors.monthCostRequired',
    );
  }

  return {
    knownAmount: money(estimatedRaw, input.currency),
    knownQuality: 'estimated',
    estimatedAmount: estimatedRaw,
    actualAmount: null,
  };
}
