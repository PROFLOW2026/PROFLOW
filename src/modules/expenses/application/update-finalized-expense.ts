import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { INTERNAL_FINANCIAL_EDIT_LATCH } from '@/shared/db/financial-latch-kinds';
import { withTrustedFinancialLatch } from '@/shared/db/trusted-financial-latch';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { resolveExpenseClassificationStatus } from '@/modules/financials/domain/economic-classification';
import { findExpenseById, findCostCategoryById, updateExpenseRow } from '../data/expenses.repository';
import { captureTaxSnapshot } from '../domain/tax';
import type { ExpenseVatMode } from '../domain/vat-mode';
import type { UpdateExpenseInput } from '../validation/schemas';
import { buildExpensePayload, persistExpenseAllocations } from './create-expense';
import { rebuildExpenseManagerialSchedules } from './rebuild-expense-managerial-schedules';
import { reconcileInventoryPurchaseFromExpenseEditOnExecutor } from '@/modules/assets/application/inventory-cost';

const EXPENSE_AUDIT_UPDATED = 'expense.updated';

export async function updateFinalizedExpense(context: OrgContext, input: UpdateExpenseInput) {
  assertPermission(context, PERMISSIONS.EXPENSES_UPDATE);

  const existing = await findExpenseById(context.db, context.organizationId, input.expenseId);
  if (!existing) throw new NotFoundError('Expense');
  if (existing.status !== 'finalized' || existing.voidsExpenseId) {
    throw new DomainRuleError(
      'Only finalized expenses in an open month can be edited directly',
      'expenses.errors.notEditable',
      { status: existing.status },
    );
  }

  try {
    await assertMonthOpenForRewrite(
      context,
      yearMonthFromBusinessDate(existing.expenseDate),
    );

    const payload = await buildExpensePayload(context, input);
    const newYearMonth = yearMonthFromBusinessDate(payload.expenseDate);
    const oldYearMonth = yearMonthFromBusinessDate(existing.expenseDate);
    if (newYearMonth !== oldYearMonth) {
      await assertMonthOpenForRewrite(context, newYearMonth);
    }

    const category = payload.row.costCategoryId
      ? await findCostCategoryById(context.db, context.organizationId, payload.row.costCategoryId)
      : null;
    const classificationStatus = resolveExpenseClassificationStatus({
      costCategoryId: payload.row.costCategoryId,
      categoryKey: category?.key ?? null,
      inventoryStockPurchase: payload.row.inventoryStockPurchase,
      costFamily: payload.row.costFamily,
    });
    if (classificationStatus !== 'classified' || !payload.row.costCategoryId) {
      throw new DomainRuleError(
        'Choose an expense type before saving',
        'expenses.errors.classificationRequired',
      );
    }

    const taxSnapshot = captureTaxSnapshot(
      payload.amounts.netAmount,
      payload.amounts.taxAmount,
      payload.amounts.grossAmount,
      payload.row.vatMode as ExpenseVatMode | null,
    );

    const {
      createdByUserId: _createdByUserId,
      status: _status,
      finalizedAt: _finalizedAt,
      voidsExpenseId: _voids,
      adjustsExpenseId: _adjusts,
      ...updatePatch
    } = payload.row;

    let updated;
    await withTransaction(context.db, async (tx) => {
      updated = await withTrustedFinancialLatch(
        tx,
        {
          kind: INTERNAL_FINANCIAL_EDIT_LATCH,
          organizationId: context.organizationId,
          permission: PERMISSIONS.EXPENSES_UPDATE,
        },
        async () => {
          await updateExpenseRow(tx, context.organizationId, input.expenseId, {
            ...updatePatch,
            status: 'finalized',
            finalizedAt: existing.finalizedAt,
            classificationStatus,
            taxSnapshot,
          });
          await persistExpenseAllocations(
            { ...context, db: tx },
            input.expenseId,
            input,
            payload.amounts,
            payload.targeting,
            payload.row.costCategoryId,
            'applied',
          );
          await rebuildExpenseManagerialSchedules({ ...context, db: tx }, tx, input.expenseId);
          if (payload.row.inventoryStockPurchase && payload.row.inventoryItemId && payload.row.inventoryPurchaseQty) {
            await reconcileInventoryPurchaseFromExpenseEditOnExecutor(
              { ...context, db: tx },
              {
                expenseId: input.expenseId,
                inventoryItemId: payload.row.inventoryItemId,
                quantity: String(payload.row.inventoryPurchaseQty),
                receivedOn: payload.expenseDate,
              },
            );
          }
          const row = await findExpenseById(tx, context.organizationId, input.expenseId);
          if (!row) throw new NotFoundError('Expense');
          return row;
        },
      );

      await recordAuditEvent({ ...context, db: tx }, {
        action: EXPENSE_AUDIT_UPDATED,
        entityType: 'expense',
        entityId: input.expenseId,
        before: {
          netAmount: existing.netAmount.amount,
          projectId: existing.projectId,
          costCategoryId: existing.costCategoryId,
          expenseDate: existing.expenseDate,
        },
        after: {
          netAmount: updated.netAmount.amount,
          projectId: updated.projectId,
          costCategoryId: updated.costCategoryId,
          expenseDate: updated.expenseDate,
        },
      });
    });

    const { tryRecomputeOpenGeneralCostMonthsForExpense } = await import(
      '@/modules/financials/application/recompute-general-cost-month'
    );
    await tryRecomputeOpenGeneralCostMonthsForExpense(context, {
      id: updated!.id,
      expenseDate: updated!.expenseDate,
    });
    if (newYearMonth !== oldYearMonth) {
      await tryRecomputeOpenGeneralCostMonthsForExpense(context, {
        id: existing.id,
        expenseDate: existing.expenseDate,
      });
    }

    return updated!;
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
    throw error;
  }
}
