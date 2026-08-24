import { recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { unbookInventoryPurchaseFromExpense } from '@/modules/assets/application/inventory-cost';
import {
  buildReversalAmounts,
  negateAllocationLines,
  reversalDescription,
} from '../domain/corrections';
import { assertReversible } from '../domain/lifecycle';
import {
  findActiveReversalForExpense,
  findExpenseById,
  insertExpense,
  replaceExpenseAllocations,
} from '../data/expenses.repository';
import type { ExpenseDetail } from '../domain/types';

const EXPENSE_AUDIT_CREATED = 'expense.created';

/**
 * D5 reversing entry: finalized negative mirror with voidsExpenseId → original.
 * Original stays finalized; Actual nets to zero for that cost.
 */
export async function createExpenseReversal(
  context: OrgContext,
  expenseId: string,
): Promise<ExpenseDetail> {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const original = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!original) throw new NotFoundError('Expense');

  await assertMonthOpenForRewrite(
    context,
    yearMonthFromBusinessDate(original.expenseDate),
  );

  const existingReversal = await findActiveReversalForExpense(
    context.db,
    context.organizationId,
    expenseId,
  );
  assertReversible(
    original.status,
    original.voidsExpenseId,
    original.adjustsExpenseId,
    Boolean(existingReversal),
  );

  if (original.inventoryStockPurchase) {
    await unbookInventoryPurchaseFromExpense(context, { expenseId: original.id });
  }

  const amounts = buildReversalAmounts(original);
  const finalizedAt = todayInTimeZone(context.organization.timezone);

  const reversalId = await insertExpense(context.db, context.organizationId, {
    expenseDate: original.expenseDate,
    description: reversalDescription(original),
    supplierName: original.supplierName,
    vendorId: original.vendorId,
    projectId: original.projectId,
    workPackageId: original.workPackageId,
    phaseId: original.phaseId,
    costFamily: original.costFamily,
    costCategoryId: original.costCategoryId,
    netAmount: amounts.netAmount,
    taxAmount: amounts.taxAmount,
    grossAmount: amounts.grossAmount,
    currency: amounts.currency,
    taxSnapshot: amounts.taxSnapshot,
    status: 'finalized',
    finalizedAt,
    paymentMethod: original.paymentMethod,
    notes: original.notes,
    voidsExpenseId: original.id,
    adjustsExpenseId: null,
    isRecurringTemplate: false,
    recurrenceRule: null,
    recurringTemplateId: null,
    allocationPeriodStart: null,
    allocationPeriodEnd: null,
    allocationDriverMethod: null,
    allocationScheduleMode: null,
    inventoryStockPurchase: false,
    inventoryItemId: null,
    inventoryPurchaseQty: null,
    createdByUserId: context.userId,
  });

  const reversedAllocations = negateAllocationLines(original.allocations);
  await replaceExpenseAllocations(
    context.db,
    context.organizationId,
    reversalId,
    reversedAllocations,
  );

  await recordAuditEvent(context, {
    action: EXPENSE_AUDIT_CREATED,
    entityType: 'expense',
    entityId: reversalId,
    metadata: { voidsExpenseId: original.id, kind: 'reversal' },
    after: {
      status: 'finalized',
      grossAmount: amounts.grossAmount,
      currency: amounts.currency,
      voidsExpenseId: original.id,
    },
  });

  const created = await findExpenseById(context.db, context.organizationId, reversalId);
  if (!created) throw new NotFoundError('Expense');

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: created.expenseDate });

  return created;
}
