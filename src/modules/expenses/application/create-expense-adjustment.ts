import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertAdjustableOriginal, assertReversible } from '../domain/lifecycle';
import {
  findActiveReversalForExpense,
  findExpenseById,
  insertExpense,
} from '../data/expenses.repository';
import type { ExpenseDetail } from '../domain/types';
import type { CreateExpenseAdjustmentInput } from '../validation/schemas';
import {
  buildExpensePayload,
  persistAllocations,
  shouldNoteFirstOverheadUsage,
} from './create-expense';
import { createExpenseReversal } from './create-expense-reversal';
import { noteModuleUsage } from '@/modules/tenancy';

const EXPENSE_AUDIT_CREATED = 'expense.created';

export interface ExpenseAdjustmentResult {
  readonly replacement: ExpenseDetail;
  readonly reversal: ExpenseDetail | null;
}

/**
 * D5 replacement: new draft expense with adjustsExpenseId → original.
 * By default also posts a voidsExpenseId reversing row so old Actual is neutralized.
 * Caller finalizes the replacement when ready (Approve into Actual Cost).
 */
export async function createExpenseAdjustment(
  context: OrgContext,
  input: CreateExpenseAdjustmentInput,
): Promise<ExpenseAdjustmentResult> {
  assertPermission(context, PERMISSIONS.EXPENSES_CREATE);
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const original = await findExpenseById(
    context.db,
    context.organizationId,
    input.adjustsExpenseId,
  );
  if (!original) throw new NotFoundError('Expense');
  assertAdjustableOriginal(original.status, original.voidsExpenseId);

  const reverseOriginal = input.reverseOriginal !== false;
  let reversal: ExpenseDetail | null = null;

  if (reverseOriginal) {
    const existing = await findActiveReversalForExpense(
      context.db,
      context.organizationId,
      original.id,
    );
    if (existing) {
      reversal = await findExpenseById(context.db, context.organizationId, existing.id);
    } else {
      assertReversible(original.status, original.voidsExpenseId, original.adjustsExpenseId, false);
      reversal = await createExpenseReversal(context, original.id);
    }
  }

  const adjustsExpenseId = input.adjustsExpenseId;
  const {
    adjustsExpenseId: _adjusts,
    reverseOriginal: _reverse,
    ...createFields
  } = input;
  void _adjusts;
  void _reverse;
  const payload = await buildExpensePayload(context, createFields);
  const noteOverhead = await shouldNoteFirstOverheadUsage(context, payload.targeting);

  const expenseId = await insertExpense(context.db, context.organizationId, {
    ...payload.row,
    adjustsExpenseId,
    voidsExpenseId: null,
  });

  await persistAllocations(context, expenseId, payload.amounts.grossAmount, createFields.allocations);
  if (noteOverhead) {
    await noteModuleUsage(context.db, context.organizationId, 'overhead');
  }

  const replacement = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!replacement) throw new NotFoundError('Expense');

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_CREATED,
    entityType: 'expense',
    entityId: expenseId,
    metadata: {
      adjustsExpenseId,
      reversalExpenseId: reversal?.id ?? null,
      kind: 'adjustment_replacement',
    },
    after: {
      status: 'draft',
      grossAmount: payload.row.grossAmount,
      currency: payload.row.currency,
      adjustsExpenseId,
    },
  });

  return { replacement, reversal };
}
