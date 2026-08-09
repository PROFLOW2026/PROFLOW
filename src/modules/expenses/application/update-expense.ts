import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertEditable } from '../domain/lifecycle';
import { findExpenseById, updateExpenseRow } from '../data/expenses.repository';
import type { UpdateExpenseInput } from '../validation/schemas';
import { noteModuleUsage } from '@/modules/tenancy';
import { isOverheadTargeting } from '../domain/targeting';
import { buildExpensePayload, persistAllocations, shouldNoteFirstOverheadUsage } from './create-expense';

const EXPENSE_AUDIT_UPDATED = 'expense.updated';

export async function updateExpense(context: OrgContext, input: UpdateExpenseInput) {
  assertPermission(context, PERMISSIONS.EXPENSES_UPDATE);

  const existing = await findExpenseById(context.db, context.organizationId, input.expenseId);
  if (!existing) throw new NotFoundError('Expense');
  assertEditable(existing.status);

  const payload = await buildExpensePayload(context, input);
  const noteOverhead = await shouldNoteFirstOverheadUsage(context, payload.targeting);

  const {
    createdByUserId: _createdByUserId,
    status: _status,
    finalizedAt: _finalizedAt,
    taxSnapshot: _taxSnapshot,
    ...updatePatch
  } = payload.row;

  await updateExpenseRow(context.db, context.organizationId, input.expenseId, updatePatch);
  await persistAllocations(context, input.expenseId, payload.amounts.grossAmount, input.allocations);
  if (noteOverhead && isOverheadTargeting(payload.targeting)) {
    await noteModuleUsage(context.db, context.organizationId, 'overhead');
  }

  const updated = await findExpenseById(context.db, context.organizationId, input.expenseId);
  if (!updated) throw new NotFoundError('Expense');

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_UPDATED,
    entityType: 'expense',
    entityId: input.expenseId,
    before: { status: existing.status },
    after: { status: updated.status },
  });

  return updated;
}
