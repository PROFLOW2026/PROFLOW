import { recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertApprovalAllowsAction } from '@/modules/approvals';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { bookInventoryPurchaseFromExpenseOnExecutor } from '@/modules/assets/application/inventory-cost';
import { isPositiveMoney, toNumericString } from '@/shared/money';
import { assertFinalizable } from '../domain/lifecycle';
import { captureTaxSnapshot } from '../domain/tax';
import { isWeightAllocationMethod } from '../domain/types';
import {
  assertInstallmentScheduleConserves,
  buildEqualInstallmentSchedule,
  yearMonthFromBusinessDate as installmentYearMonth,
} from '../domain/installment-schedule';
import { findExpenseById, updateExpenseRow } from '../data/expenses.repository';
import { markExpenseAllocationRunsApplied } from '../data/allocation-runs.repository';
import { replaceScheduleLines } from '../data/managerial-schedule.repository';
import { runAutomaticAllocation } from './run-automatic-allocation';

const EXPENSE_AUDIT_FINALIZED = 'expense.finalized';

export async function finalizeExpense(context: OrgContext, expenseId: string) {
  assertPermission(context, PERMISSIONS.EXPENSES_FINALIZE);

  const existing = await findExpenseById(context.db, context.organizationId, expenseId);
  if (!existing) throw new NotFoundError('Expense');
  assertFinalizable(existing.status);

  if (existing.inventoryStockPurchase) {
    if (!existing.inventoryItemId || !existing.inventoryPurchaseQty) {
      throw new DomainRuleError(
        'Inventory stock purchase requires item and quantity before finalize',
        'expenses.errors.inventoryStockPurchaseIncomplete',
      );
    }
  }

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

  const finalized = await withTransaction(context.db, async (tx) => {
    const txContext = withExecutor(context, tx);

    await updateExpenseRow(tx, context.organizationId, expenseId, {
      status: 'finalized',
      finalizedAt,
      taxSnapshot,
    });

    const row = await findExpenseById(tx, context.organizationId, expenseId);
    if (!row) throw new NotFoundError('Expense');

    if (row.inventoryStockPurchase) {
      await bookInventoryPurchaseFromExpenseOnExecutor(txContext, {
        expenseId,
        inventoryItemId: row.inventoryItemId!,
        quantity: row.inventoryPurchaseQty!,
        receivedOn: row.expenseDate,
      });
    } else {
      const installmentCount = row.installmentCount >= 1 ? row.installmentCount : 1;
      if (isPositiveMoney(row.netAmount)) {
        const startDate = row.installmentStartDate ?? row.expenseDate;
        const schedule = buildEqualInstallmentSchedule({
          totalNet: row.netAmount,
          installmentCount,
          startYearMonth: installmentYearMonth(startDate),
        });
        assertInstallmentScheduleConserves(schedule, row.netAmount);
        await replaceScheduleLines(
          tx,
          context.organizationId,
          expenseId,
          schedule.lines.map((line) => ({
            yearMonth: line.yearMonth,
            amount: toNumericString(line.amount),
            currency: line.amount.currency,
            sortOrder: line.sortOrder,
            status: 'scheduled',
          })),
        );
      }
    }

    await recordAuditEvent(txContext, {
      action: EXPENSE_AUDIT_FINALIZED,
      entityType: 'expense',
      entityId: expenseId,
      before: { status: 'draft' },
      after: {
        status: 'finalized',
        finalizedAt,
        inventoryStockPurchase: row.inventoryStockPurchase,
        inventoryCostBooked: row.inventoryStockPurchase,
      },
    });

    return row;
  });

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: finalized.expenseDate });

  return finalized;
}
