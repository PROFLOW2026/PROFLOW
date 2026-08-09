import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findAdjustmentRowsForExpense,
  findExpenseById,
  findReversalRowsForExpense,
} from '../data/expenses.repository';
import {
  resolveCorrectionOriginalId,
  sumCorrectionChainNet,
  type CorrectionChainEntry,
} from '../domain/corrections';
import type { MoneyValue } from '@/shared/money';

export interface ExpenseCorrectionChain {
  readonly originalExpenseId: string;
  readonly entries: readonly CorrectionChainEntry[];
  readonly netAmount: MoneyValue;
  readonly hasLinks: boolean;
}

export async function getExpenseCorrectionChain(
  context: OrgContext,
  expenseId: string,
): Promise<ExpenseCorrectionChain> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);

  const expense = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!expense) throw new NotFoundError('Expense');

  const originalExpenseId = resolveCorrectionOriginalId(expense);
  const original = await findExpenseById(context.db, context.organizationId, originalExpenseId);
  if (!original) throw new NotFoundError('Expense');

  const [reversals, adjustments] = await Promise.all([
    findReversalRowsForExpense(context.db, context.organizationId, originalExpenseId),
    findAdjustmentRowsForExpense(context.db, context.organizationId, originalExpenseId),
  ]);

  const entries: CorrectionChainEntry[] = [
    {
      id: original.id,
      role: 'original',
      status: original.status,
      description: original.description,
      expenseDate: original.expenseDate,
      netAmount: original.netAmount,
      grossAmount: original.grossAmount,
    },
  ];

  for (const reversalRef of reversals) {
    const reversal = await findExpenseById(context.db, context.organizationId, reversalRef.id);
    if (!reversal) continue;
    entries.push({
      id: reversal.id,
      role: 'reversal',
      status: reversal.status,
      description: reversal.description,
      expenseDate: reversal.expenseDate,
      netAmount: reversal.netAmount,
      grossAmount: reversal.grossAmount,
    });
  }

  for (const adjustmentRef of adjustments) {
    const replacement = await findExpenseById(context.db, context.organizationId, adjustmentRef.id);
    if (!replacement) continue;
    entries.push({
      id: replacement.id,
      role: 'replacement',
      status: replacement.status,
      description: replacement.description,
      expenseDate: replacement.expenseDate,
      netAmount: replacement.netAmount,
      grossAmount: replacement.grossAmount,
    });
  }

  const hasLinks = entries.length > 1;
  return {
    originalExpenseId,
    entries,
    netAmount: sumCorrectionChainNet(entries, original.netAmount.currency),
    hasLinks,
  };
}
