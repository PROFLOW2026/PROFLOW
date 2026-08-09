import { recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertFinalizable } from '../domain/lifecycle';
import { captureTaxSnapshot } from '../domain/tax';
import { findExpenseById, updateExpenseRow } from '../data/expenses.repository';

const EXPENSE_AUDIT_FINALIZED = 'expense.finalized';

export async function finalizeExpense(context: OrgContext, expenseId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const existing = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!existing) throw new NotFoundError('Expense');
  assertFinalizable(existing.status);

  const finalizedAt = todayInTimeZone(context.organization.timezone);
  const taxSnapshot = captureTaxSnapshot(existing.netAmount, existing.taxAmount, existing.grossAmount);

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
