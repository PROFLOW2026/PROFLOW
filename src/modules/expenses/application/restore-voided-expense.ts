import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { assertRestorable } from '../domain/lifecycle';
import { findExpenseById, updateExpenseRow } from '../data/expenses.repository';
import {
  listVoidedScheduleYearMonths,
  restoreScheduleLines,
} from '../data/managerial-schedule.repository';
import type { ExpenseDetail } from '../domain/types';

/**
 * Restore a simple void (status flip) back to finalized Actual recognition.
 * Void audit history is preserved; this appends expense.restored.
 */
export async function restoreVoidedExpense(
  context: OrgContext,
  expenseId: string,
): Promise<ExpenseDetail> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const existing = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!existing) throw new NotFoundError('Expense');

  assertRestorable(existing.status, existing.voidsExpenseId);

  let scheduleYearMonths: string[] = [];

  try {
    await assertMonthOpenForRewrite(
      context,
      yearMonthFromBusinessDate(existing.expenseDate),
    );

    scheduleYearMonths = await listVoidedScheduleYearMonths(
      context.db,
      context.organizationId,
      expenseId,
    );

    await restoreScheduleLines(context.db, context.organizationId, expenseId);
    await updateExpenseRow(context.db, context.organizationId, expenseId, { status: 'finalized' });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EXPENSE_RESTORED,
    entityType: 'expense',
    entityId: expenseId,
    before: { status: 'void' },
    after: { status: 'finalized' },
  });

  const restored = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!restored) throw new NotFoundError('Expense');

  const { tryRecomputeOpenGeneralCostMonthsForExpense } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonthsForExpense(context, {
    id: restored.id,
    expenseDate: restored.expenseDate,
    scheduleYearMonths,
  });

  return restored;
}
