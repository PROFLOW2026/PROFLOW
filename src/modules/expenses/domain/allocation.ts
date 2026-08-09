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
  subtractMoney,
  sumMoney,
  toDecimalValue,
  type MoneyValue,
} from '@/shared/money';
import type { AllocationLineInput, AllocationMethod, ResolvedAllocationLine } from './types';

/**
 * Validates and resolves allocation lines so their amounts sum exactly to the
 * expense gross total (doc 04 §8).
 *
 * Percentage lines apply to the full expense amount; fixed-amount lines use the
 * entered value. Rounding residue lands on the last line.
 */
export function resolveAllocationLines(
  grossAmount: MoneyValue,
  lines: readonly AllocationLineInput[],
): ResolvedAllocationLine[] {
  if (lines.length === 0) return [];

  validateAllocationTargets(lines);

  const resolvedAmounts: MoneyValue[] = [];

  for (const line of lines) {
    if (line.method === 'manual_amount') {
      if (!line.amount?.trim()) {
        throw new DomainRuleError(
          'Allocation amount is required for manual amount lines',
          'expenses.errors.allocationAmountRequired',
        );
      }
      resolvedAmounts.push(money(line.amount, grossAmount.currency));
      continue;
    }

    if (!line.percent?.trim()) {
      throw new DomainRuleError(
        'Allocation percentage is required for manual percent lines',
        'expenses.errors.allocationPercentRequired',
      );
    }
    resolvedAmounts.push(percentOfMoney(grossAmount, line.percent));
  }

  distributeRoundingResidue(grossAmount, resolvedAmounts);

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
  }));
}

function distributeRoundingResidue(grossAmount: MoneyValue, resolvedAmounts: MoneyValue[]): void {
  const total = sumMoney(resolvedAmounts, grossAmount.currency);
  if (moneyEquals(total, grossAmount)) return;

  const residue = subtractMoney(grossAmount, total);
  const scale = displayScaleFor(grossAmount.currency);
  const minorUnit = new Decimal(10).pow(-scale);
  const tolerance = minorUnit.times(Math.max(resolvedAmounts.length, 1));

  if (toDecimalValue(absMoney(residue)).greaterThan(tolerance)) {
    throw new DomainRuleError(
      `Allocation lines must sum to ${grossAmount.amount} ${grossAmount.currency}, received ${total.amount}`,
      'expenses.errors.allocationSumMismatch',
      { expected: grossAmount.amount, actual: total.amount },
    );
  }

  const lastIndex = resolvedAmounts.length - 1;
  resolvedAmounts[lastIndex] = addMoney(resolvedAmounts[lastIndex]!, residue);
}

export function validateAllocationSum(grossAmount: MoneyValue, lineAmounts: readonly MoneyValue[]): void {
  if (lineAmounts.length === 0) return;
  const total = sumMoney(lineAmounts, grossAmount.currency);
  if (!moneyEquals(total, grossAmount)) {
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
  }));
}
