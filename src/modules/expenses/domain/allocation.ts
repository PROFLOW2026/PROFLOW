import Decimal from 'decimal.js';
import { DomainRuleError } from '@/shared/errors';
import {
  addMoney,
  absMoney,
  displayScaleFor,
  fromNumericString,
  money,
  moneyEquals,
  percentOfMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import type {
  AllocationAmountBasis,
  AllocationLineInput,
  AllocationMethod,
  AllocationRunExplanation,
  ProjectWeightBasis,
  ResolvedAllocationLine,
  WeightAllocationMethod,
} from './types';
import { isWeightAllocationMethod } from './types';

/**
 * Validates and resolves allocation lines so their amounts sum exactly to the
 * allocatable total (gross for legacy manual capture; net for automatic drivers).
 *
 * Percentage lines apply to the full allocatable amount; fixed-amount lines use
 * the entered value. Rounding residue lands on the last line (deterministic).
 */
export function resolveAllocationLines(
  allocatableAmount: MoneyValue,
  lines: readonly AllocationLineInput[],
  options?: { readonly defaultAmountBasis?: AllocationAmountBasis },
): ResolvedAllocationLine[] {
  if (lines.length === 0) return [];

  validateAllocationTargets(lines);

  const defaultBasis = options?.defaultAmountBasis ?? 'gross';
  const resolvedAmounts: MoneyValue[] = [];

  for (const line of lines) {
    if (isWeightAllocationMethod(line.method)) {
      throw new DomainRuleError(
        'Weight allocation methods must be resolved via allocateByProjectWeights',
        'expenses.errors.useWeightAllocator',
      );
    }

    if (line.method === 'manual_amount') {
      if (!line.amount?.trim()) {
        throw new DomainRuleError(
          'Allocation amount is required for manual amount lines',
          'expenses.errors.allocationAmountRequired',
        );
      }
      resolvedAmounts.push(money(line.amount, allocatableAmount.currency));
      continue;
    }

    if (!line.percent?.trim()) {
      throw new DomainRuleError(
        'Allocation percentage is required for manual percent lines',
        'expenses.errors.allocationPercentRequired',
      );
    }
    resolvedAmounts.push(percentOfMoney(allocatableAmount, line.percent));
  }

  distributeRoundingResidue(allocatableAmount, resolvedAmounts);

  return lines.map((line, index) => ({
    targetType: line.targetType,
    projectId: line.targetType === 'project' ? (line.projectId ?? null) : null,
    workPackageId: line.workPackageId ?? null,
    costCategoryId: line.costCategoryId ?? null,
    method: line.method,
    amount: resolvedAmounts[index]!,
    percent: line.method === 'manual_percent' ? normalisePercent(line.percent!) : null,
    notes: line.notes ?? null,
    sortOrder: line.sortOrder,
    amountBasis: line.amountBasis ?? defaultBasis,
  }));
}

/**
 * Automatic shared/overhead allocation by project weights.
 * SUM(amounts) = allocatableNet exactly; residue on the last project (id-sorted).
 */
export function allocateByProjectWeights(input: {
  readonly allocatableNet: MoneyValue;
  readonly method: WeightAllocationMethod;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly bases: readonly ProjectWeightBasis[];
  readonly costCategoryId?: string | null;
  readonly sourceExpenseId?: string;
}): {
  readonly lines: ResolvedAllocationLine[];
  readonly explanation: AllocationRunExplanation;
} {
  const { allocatableNet, method, bases } = input;

  if (bases.length === 0) {
    throw new DomainRuleError(
      'No eligible projects for allocation',
      'expenses.errors.allocationNoEligibleProjects',
    );
  }

  const sorted = bases.slice().sort((a, b) => a.projectId.localeCompare(b.projectId));
  const basisUnit = sorted[0]!.basisUnit;
  if (sorted.some((row) => row.basisUnit !== basisUnit)) {
    throw new DomainRuleError(
      'Allocation bases must share a single unit',
      'expenses.errors.allocationBasisUnitMismatch',
    );
  }

  const basisDecimals = sorted.map((row) => {
    const value = new Decimal(row.basisValue);
    if (value.isNegative()) {
      throw new DomainRuleError(
        'Allocation basis values cannot be negative',
        'expenses.errors.allocationBasisNegative',
      );
    }
    return { projectId: row.projectId, basis: value };
  });

  const totalBasis = basisDecimals.reduce((acc, row) => acc.plus(row.basis), new Decimal(0));
  if (totalBasis.isZero()) {
    throw new DomainRuleError(
      'Allocation basis total is zero - cannot allocate',
      'expenses.errors.allocationBasisZero',
    );
  }

  // equal_split: unit basis of 1 per full-slice project, or active-day counts
  // after partial-month exposure (positive count required).
  if (method === 'equal_split') {
    for (const row of basisDecimals) {
      if (row.basis.lte(0)) {
        throw new DomainRuleError(
          'equal_split requires a positive unit/active-day basis per project',
          'expenses.errors.equalSplitBasisInvalid',
        );
      }
    }
  }

  const scale = displayScaleFor(allocatableNet.currency);
  const amounts: MoneyValue[] = [];
  let allocated = money('0', allocatableNet.currency);

  for (let index = 0; index < basisDecimals.length; index += 1) {
    const row = basisDecimals[index]!;
    if (index === basisDecimals.length - 1) {
      amounts.push(subtractMoney(allocatableNet, allocated));
      break;
    }
    const raw = toDecimalValue(allocatableNet).times(row.basis).dividedBy(totalBasis);
    const rounded = roundMoney(money(raw, allocatableNet.currency), scale);
    amounts.push(rounded);
    allocated = addMoney(allocated, rounded);
  }

  distributeRoundingResidue(allocatableNet, amounts);

  const lines: ResolvedAllocationLine[] = basisDecimals.map((row, index) => {
    const amount = amounts[index]!;
    const percent = toDecimalValue(allocatableNet).isZero()
      ? '0.0000'
      : toDecimalValue(amount).times(100).dividedBy(toDecimalValue(allocatableNet)).toFixed(4);
    return {
      targetType: 'project' as const,
      projectId: row.projectId,
      workPackageId: null,
      costCategoryId: input.costCategoryId ?? null,
      method,
      amount,
      percent,
      notes: null,
      sortOrder: index,
      amountBasis: 'net' as const,
    };
  });

  const explanation: AllocationRunExplanation = {
    sourceExpenseId: input.sourceExpenseId,
    method,
    amountBasis: 'net',
    allocatableNet,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    eligibleProjectIds: lines.map((line) => line.projectId!),
    totalBasis: totalBasis.toFixed(6),
    basisUnit,
    lines: lines.map((line, index) => ({
      projectId: line.projectId!,
      basisValue: basisDecimals[index]!.basis.toFixed(6),
      percent: line.percent!,
      amount: line.amount.amount,
    })),
  };

  return { lines, explanation };
}

/** Builds equal-split bases (explicit method only - never a silent default). */
export function equalSplitBases(projectIds: readonly string[]): ProjectWeightBasis[] {
  return projectIds
    .slice()
    .sort((a, b) => a.localeCompare(b))
    .map((projectId) => ({
      projectId,
      basisValue: '1',
      basisUnit: 'count' as const,
    }));
}

function distributeRoundingResidue(totalAmount: MoneyValue, resolvedAmounts: MoneyValue[]): void {
  const total = sumMoney(resolvedAmounts, totalAmount.currency);
  if (moneyEquals(total, totalAmount)) return;

  const residue = subtractMoney(totalAmount, total);
  const scale = displayScaleFor(totalAmount.currency);
  const minorUnit = new Decimal(10).pow(-scale);
  const tolerance = minorUnit.times(Math.max(resolvedAmounts.length, 1));

  if (toDecimalValue(absMoney(residue)).greaterThan(tolerance)) {
    throw new DomainRuleError(
      `Allocation lines must sum to ${totalAmount.amount} ${totalAmount.currency}, received ${total.amount}`,
      'expenses.errors.allocationSumMismatch',
      { expected: totalAmount.amount, actual: total.amount },
    );
  }

  const lastIndex = resolvedAmounts.length - 1;
  resolvedAmounts[lastIndex] = addMoney(resolvedAmounts[lastIndex]!, residue);
}

export function validateAllocationSum(totalAmount: MoneyValue, lineAmounts: readonly MoneyValue[]): void {
  if (lineAmounts.length === 0) return;
  const total = sumMoney(lineAmounts, totalAmount.currency);
  if (!moneyEquals(total, totalAmount)) {
    throw new DomainRuleError(
      'Allocation lines must sum exactly to the expense amount',
      'expenses.errors.allocationSumMismatch',
    );
  }
}

export function allocationPercentTotal(lines: readonly AllocationLineInput[]): Decimal {
  return lines
    .filter((line) => line.method === 'manual_percent')
    .reduce((acc, line) => acc.plus(new Decimal(line.percent ?? '0')), new Decimal(0));
}

function validateAllocationTargets(lines: readonly AllocationLineInput[]): void {
  for (const line of lines) {
    if (line.targetType === 'project' && !line.projectId) {
      throw new DomainRuleError(
        'Project allocation lines require a project',
        'expenses.errors.allocationProjectRequired',
      );
    }
    if (line.targetType === 'overhead' && line.projectId) {
      throw new DomainRuleError(
        'Overhead allocation lines cannot reference a project',
        'expenses.errors.allocationOverheadNoProject',
      );
    }
  }
}

function normalisePercent(value: string): string {
  return new Decimal(value).toFixed(4);
}

export function describeAllocationMethod(method: AllocationMethod): string {
  return method;
}

/** Rehydrates persisted allocation rows for display. */
export function allocationFromPersisted(
  rows: readonly {
    targetType: 'project' | 'overhead';
    projectId: string | null;
    workPackageId: string | null;
    costCategoryId: string | null;
    method: AllocationMethod;
    amount: string;
    currency: string;
    percent: string | null;
    notes: string | null;
    sortOrder: number;
    amountBasis?: AllocationAmountBasis | null;
  }[],
): ResolvedAllocationLine[] {
  return rows.map((row) => ({
    targetType: row.targetType,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    costCategoryId: row.costCategoryId,
    method: row.method,
    amount: fromNumericString(row.amount, row.currency)!,
    percent: row.percent,
    notes: row.notes,
    sortOrder: row.sortOrder,
    amountBasis: row.amountBasis ?? 'gross',
  }));
}
