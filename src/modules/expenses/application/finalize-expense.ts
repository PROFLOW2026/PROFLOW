import { recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertApprovalAllowsAction } from '@/modules/approvals';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { assertFinalizable } from '../domain/lifecycle';
import { captureTaxSnapshot } from '../domain/tax';
import { isWeightAllocationMethod } from '../domain/types';
import { findExpenseById, updateExpenseRow } from '../data/expenses.repository';
import { markExpenseAllocationRunsApplied } from '../data/allocation-runs.repository';
import { runAutomaticAllocation } from './run-automatic-allocation';

const EXPENSE_AUDIT_FINALIZED = 'expense.finalized';

export async function finalizeExpense(context: OrgContext, expenseId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const existing = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!existing) throw new NotFoundError('Expense');
  assertFinalizable(existing.status);

  // Refuse silent rewrite of a closed operational month.
  await assertMonthOpenForRewrite(
    context,
    yearMonthFromBusinessDate(existing.expenseDate),
  );

  // Optional approvals: threshold rules may block until approved (no-op when unused).
  await assertApprovalAllowsAction(context, {
    entityType: 'expense',
    entityId: expenseId,
    amount: existing.netAmount.amount,
    currency: existing.netAmount.currency,
    submitIfMissing: true,
  });

  const finalizedAt = todayInTimeZone(context.organization.timezone);
  const taxSnapshot = captureTaxSnapshot(existing.netAmount, existing.taxAmount, existing.grossAmount);

  // Freeze automatic allocation snapshot on finalize so later contract growth
  // cannot rewrite this period's overhead. Periodic schedules keep prior applied
  // slices frozen and only materialize pending months.
  if (
    existing.allocationDriverMethod &&
    isWeightAllocationMethod(existing.allocationDriverMethod) &&
    existing.allocationPeriodStart &&
    existing.allocationPeriodEnd &&
    !existing.projectId
  ) {
    await runAutomaticAllocation(context, {
      expenseId,
      costFamily: existing.costFamily,
      projectId: existing.projectId,
      costCategoryId: existing.costCategoryId,
      netAmount: existing.netAmount,
      periodStart: existing.allocationPeriodStart,
      periodEnd: existing.allocationPeriodEnd,
      explicitMethod: existing.allocationDriverMethod,
      scheduleMode: existing.allocationScheduleMode,
      runStatus: 'applied',
      preserveAppliedSlices: true,
    });
  } else {
    await markExpenseAllocationRunsApplied(context.db, context.organizationId, expenseId);
  }

  await updateExpenseRow(context.db, context.organizationId, expenseId, {
    status: 'finalized',
    finalizedAt,
    taxSnapshot,
  });

  const finalized = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!finalized) throw new NotFoundError('Expense');

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_FINALIZED,
    entityType: 'expense',
    entityId: expenseId,
    before: { status: 'draft' },
    after: { status: 'finalized', finalizedAt },
  });

  return finalized;
}
