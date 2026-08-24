import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { unbookInventoryPurchaseFromExpense } from '@/modules/assets/application/inventory-cost';
import { assertVoidable } from '../domain/lifecycle';
import {
  findActiveReversalForExpense,
  findExpenseById,
  updateExpenseRow,
} from '../data/expenses.repository';
import { voidScheduleLines } from '../data/managerial-schedule.repository';
import type { ExpenseDetail } from '../domain/types';

const EXPENSE_AUDIT_VOIDED = 'expense.voided';

/**
 * Simple void: flip finalized → void on the same row (excluded from Actual).
 * Prefer createExpenseReversal / createExpenseAdjustment when a ledger link is required.
 */
export async function voidExpense(context: OrgContext, expenseId: string): Promise<ExpenseDetail> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const existing = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!existing) throw new NotFoundError('Expense');

  try {
    await assertMonthOpenForRewrite(
      context,
      yearMonthFromBusinessDate(existing.expenseDate),
    );

    const activeReversal = await findActiveReversalForExpense(
      context.db,
      context.organizationId,
      expenseId,
    );
    assertVoidable(existing.status, existing.voidsExpenseId, Boolean(activeReversal));

    if (existing.inventoryStockPurchase) {
      await unbookInventoryPurchaseFromExpense(context, { expenseId });
    }

    await updateExpenseRow(context.db, context.organizationId, expenseId, { status: 'void' });
    await voidScheduleLines(context.db, context.organizationId, expenseId);
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_VOIDED,
    entityType: 'expense',
    entityId: expenseId,
    before: { status: 'finalized' },
    after: { status: 'void' },
  });

  const voided = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!voided) throw new NotFoundError('Expense');

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: voided.expenseDate });

  return voided;
}

