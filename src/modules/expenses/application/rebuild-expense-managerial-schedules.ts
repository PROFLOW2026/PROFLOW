import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { isPositiveMoney, toNumericString } from '@/shared/money';
import { isWeightAllocationMethod } from '../domain/types';
import {
  assertInstallmentScheduleConserves,
  buildEqualInstallmentSchedule,
  yearMonthFromBusinessDate as installmentYearMonth,
} from '../domain/installment-schedule';
import { findExpenseById } from '../data/expenses.repository';
import { markExpenseAllocationRunsApplied } from '../data/allocation-runs.repository';
import { replaceScheduleLines } from '../data/managerial-schedule.repository';
import { runAutomaticAllocation } from './run-automatic-allocation';
import type { DbExecutor } from '@/shared/db/types';

/**
 * Rebuild managerial schedules / allocation runs after a finalized expense edit.
 * Keeps profitability slices aligned with the corrected economics.
 */
export async function rebuildExpenseManagerialSchedules(
  context: OrgContext,
  db: DbExecutor,
  expenseId: string,
): Promise<void> {
  const row = await findExpenseById(db, context.organizationId, expenseId);
  if (!row) throw new NotFoundError('Expense');

  if (row.inventoryStockPurchase) {
    return;
  }

  if (
    row.allocationDriverMethod &&
    isWeightAllocationMethod(row.allocationDriverMethod) &&
    row.allocationPeriodStart &&
    row.allocationPeriodEnd &&
    !row.projectId
  ) {
    await runAutomaticAllocation({ ...context, db }, {
      expenseId,
      costFamily: row.costFamily,
      projectId: row.projectId,
      costCategoryId: row.costCategoryId,
      netAmount: row.netAmount,
      periodStart: row.allocationPeriodStart,
      periodEnd: row.allocationPeriodEnd,
      explicitMethod: row.allocationDriverMethod,
      scheduleMode: row.allocationScheduleMode,
      runStatus: 'applied',
      preserveAppliedSlices: false,
    });
    return;
  }

  await markExpenseAllocationRunsApplied(db, context.organizationId, expenseId);

  const installmentCount = row.installmentCount >= 1 ? row.installmentCount : 1;
  if (!isPositiveMoney(row.netAmount)) {
    await replaceScheduleLines(db, context.organizationId, expenseId, []);
    return;
  }

  const startDate = row.installmentStartDate ?? row.expenseDate;
  const schedule = buildEqualInstallmentSchedule({
    totalNet: row.netAmount,
    installmentCount,
    startYearMonth: installmentYearMonth(startDate),
  });
  assertInstallmentScheduleConserves(schedule, row.netAmount);
  await replaceScheduleLines(
    db,
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
