import type { BusinessDate } from '@/shared/dates';
import { addMoney, money, negateMoney, toNumericString, type MoneyValue } from '@/shared/money';
import { captureTaxSnapshot } from './tax';
import type { ExpenseDetail, ExpenseStatus, ResolvedAllocationLine, TaxSnapshot } from './types';

/**
 * D5 correction builders: reversing / replacement rows reference the original
 * via voidsExpenseId / adjustsExpenseId. Amounts stay NET-consistent.
 */

export type CorrectionChainRole = 'original' | 'reversal' | 'replacement';

export interface CorrectionChainEntry {
  readonly id: string;
  readonly role: CorrectionChainRole;
  readonly status: ExpenseStatus;
  readonly description: string | null;
  readonly expenseDate: BusinessDate;
  readonly netAmount: MoneyValue;
  readonly grossAmount: MoneyValue;
}

/** Net Actual-relevant total across a correction chain (void rows excluded). */
export function sumCorrectionChainNet(
  entries: readonly CorrectionChainEntry[],
  currency: string,
): MoneyValue {
  let total = money('0', currency);
  for (const entry of entries) {
    if (entry.status === 'void') continue;
    // Draft replacements are not yet in Actual Cost.
    if (entry.role === 'replacement' && entry.status === 'draft') continue;
    total = addMoney(total, entry.netAmount);
  }
  return total;
}

export function resolveCorrectionOriginalId(expense: {
  readonly id: string;
  readonly voidsExpenseId: string | null;
  readonly adjustsExpenseId: string | null;
}): string {
  if (expense.voidsExpenseId) return expense.voidsExpenseId;
  if (expense.adjustsExpenseId) return expense.adjustsExpenseId;
  return expense.id;
}

export interface ReversalAmounts {
  readonly netAmount: string;
  readonly taxAmount: string | null;
  readonly grossAmount: string;
  readonly currency: string;
  readonly taxSnapshot: TaxSnapshot;
}

export function buildReversalAmounts(original: ExpenseDetail): ReversalAmounts {
  const net = negateMoney(original.netAmount);
  const tax = original.taxAmount ? negateMoney(original.taxAmount) : null;
  const gross = negateMoney(original.grossAmount);
  return {
    netAmount: toNumericString(net),
    taxAmount: tax ? toNumericString(tax) : null,
    grossAmount: toNumericString(gross),
    currency: original.grossAmount.currency,
    taxSnapshot: captureTaxSnapshot(net, tax, gross),
  };
}

export function negateAllocationLines(
  lines: readonly ResolvedAllocationLine[],
): Array<{
  targetType: ResolvedAllocationLine['targetType'];
  projectId: string | null;
  workPackageId: string | null;
  costCategoryId: string | null;
  method: ResolvedAllocationLine['method'];
  amount: string;
  currency: string;
  percent: string | null;
  notes: string | null;
  sortOrder: number;
  amountBasis: ResolvedAllocationLine['amountBasis'];
}> {
  return lines.map((line) => {
    const amount: MoneyValue = negateMoney(line.amount);
    return {
      targetType: line.targetType,
      projectId: line.projectId,
      workPackageId: line.workPackageId,
      costCategoryId: line.costCategoryId,
      method: line.method,
      amount: toNumericString(amount),
      currency: amount.currency,
      percent: line.percent,
      notes: line.notes,
      sortOrder: line.sortOrder,
      amountBasis: line.amountBasis,
    };
  });
}

export function reversalDescription(original: ExpenseDetail): string {
  const base = original.description?.trim();
  if (base) return `Reversal: ${base}`;
  return `Reversal of expense ${original.id}`;
}
