/**
 * Dated cash obligations for the 90-day forecast.
 * Operating expenses reduce cash by accepted AP match amounts (partial-safe); fully matched
 * rows drop from the expense path. Internal payroll uses a separate cash path.
 */

import { and, eq, inArray, isNotNull, isNull, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  apBills,
  apPoMatches,
  committedCosts,
  costCategories,
  employeePayrollPayments,
  employees,
  expenses,
  purchaseOrders,
  recurringFinancialDraftRuns,
} from '@drizzle/schema';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import { addMoney, money } from '@/shared/money';
import { businessDate, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type {
  OpenCommitmentCashRow,
  OperatingExpenseCashRow,
  PayrollObligationCashRow,
} from '../domain/cash-flow-sources';

const OPEN_COMMITMENT_STATUSES = ['open', 'partially_consumed'] as const;

export async function loadAcceptedApMatchNetByExpenseId(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, string>> {
  if (expenseIds.length === 0) return new Map();
  const matchRows = await db
    .select({
      expenseId: apPoMatches.expenseId,
      matchedAmount: apPoMatches.matchedAmount,
      currency: apPoMatches.currency,
    })
    .from(apPoMatches)
    .innerJoin(
      apBills,
      and(eq(apBills.id, apPoMatches.apBillId), eq(apBills.organizationId, apPoMatches.organizationId)),
    )
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        inArray(apPoMatches.expenseId, [...expenseIds]),
        eq(apPoMatches.status, 'accepted'),
        isNotNull(apPoMatches.expenseId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const matchedByExpense = new Map<string, string>();
  for (const row of matchRows) {
    if (!row.expenseId) continue;
    const slice = money(row.matchedAmount, row.currency);
    const prev = matchedByExpense.get(row.expenseId);
    matchedByExpense.set(
      row.expenseId,
      prev ? addMoney(money(prev, row.currency), slice).amount : slice.amount,
    );
  }
  return matchedByExpense;
}

export async function loadPaidRecurringOccurrenceMaps(
  db: DbExecutor,
  organizationId: string,
): Promise<{
  readonly paidMonthsByDraftId: Map<string, Set<string>>;
  readonly paidMonthsByProjectId: Map<string, Set<string>>;
}> {
  const rows = await db
    .select({
      draftId: recurringFinancialDraftRuns.draftId,
      occurrenceYearMonth: recurringFinancialDraftRuns.occurrenceYearMonth,
      projectId: expenses.projectId,
      paymentStatus: expenses.paymentStatus,
      grossAmount: expenses.grossAmount,
      paidGrossAmount: expenses.paidGrossAmount,
      currency: expenses.currency,
    })
    .from(recurringFinancialDraftRuns)
    .innerJoin(expenses, eq(expenses.id, recurringFinancialDraftRuns.generatedEntityId))
    .where(
      and(
        eq(recurringFinancialDraftRuns.organizationId, organizationId),
        eq(recurringFinancialDraftRuns.generatedEntityType, 'expense'),
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    );

  const paidMonthsByDraftId = new Map<string, Set<string>>();
  const paidMonthsByProjectId = new Map<string, Set<string>>();

  for (const row of rows) {
    const month = row.occurrenceYearMonth;
    if (!month) continue;
    const gross = money(row.grossAmount, row.currency);
    const paid = money(row.paidGrossAmount ?? '0', row.currency);
    const settled =
      row.paymentStatus === 'paid' || Number(paid.amount) >= Number(gross.amount);
    if (!settled) continue;

    let draftMonths = paidMonthsByDraftId.get(row.draftId);
    if (!draftMonths) {
      draftMonths = new Set();
      paidMonthsByDraftId.set(row.draftId, draftMonths);
    }
    draftMonths.add(month);

    if (row.projectId) {
      let projectMonths = paidMonthsByProjectId.get(row.projectId);
      if (!projectMonths) {
        projectMonths = new Set();
        paidMonthsByProjectId.set(row.projectId, projectMonths);
      }
      projectMonths.add(month);
    }
  }

  return { paidMonthsByDraftId, paidMonthsByProjectId };
}

function asBusinessDate(value: string | null): BusinessDate | null {
  if (!value) return null;
  return businessDate(value);
}

export async function loadOperatingExpenseCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly OperatingExpenseCashRow[]> {
  const reversal = alias(expenses, 'expense_reversal');
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      projectId: expenses.projectId,
      grossAmount: expenses.grossAmount,
      netAmount: expenses.netAmount,
      taxAmount: expenses.taxAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paymentStatus: expenses.paymentStatus,
      paidAt: expenses.paidAt,
    })
    .from(expenses)
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        isNull(expenses.archivedAt),
        eq(expenses.isRecurringTemplate, false),
        isNull(expenses.voidsExpenseId),
        or(isNull(expenses.paymentStatus), sql`${expenses.paymentStatus} <> 'paid'`),
        or(isNull(costCategories.key), sql`${costCategories.key} <> 'internal_employee_payroll'`),
        notExists(
          db
            .select({ id: reversal.id })
            .from(reversal)
            .where(
              and(
                eq(reversal.organizationId, organizationId),
                eq(reversal.voidsExpenseId, expenses.id),
                isNull(reversal.archivedAt),
              ),
            ),
        ),
      ),
    );

  const matchedByExpense = await loadAcceptedApMatchNetByExpenseId(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    projectId: row.projectId,
    grossAmount: row.grossAmount,
    netAmount: row.netAmount,
    taxAmount: row.taxAmount,
    acceptedApMatchedNetAmount: matchedByExpense.get(row.id) ?? '0',
    currency: row.currency,
    expenseDate: businessDate(row.expenseDate),
    dueDate: asBusinessDate(row.dueDate),
    installmentCount: row.installmentCount,
    installmentStartDate: asBusinessDate(row.installmentStartDate),
    installmentsPaidCount: row.installmentsPaidCount,
    paidGrossAmount: row.paidGrossAmount,
    paymentStatus: row.paymentStatus,
    paidAt: asBusinessDate(row.paidAt),
  }));
}

export async function loadPayrollObligationCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly PayrollObligationCashRow[]> {
  const rows = await db
    .select({
      id: employeePayrollPayments.id,
      employeeId: employeePayrollPayments.employeeId,
      employeeName: employees.name,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      currency: employeePayrollPayments.currency,
      dueDate: employeePayrollPayments.dueDate,
    })
    .from(employeePayrollPayments)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeePayrollPayments.employeeId),
        eq(employees.organizationId, employeePayrollPayments.organizationId),
      ),
    )
    .where(
      and(
        eq(employeePayrollPayments.organizationId, organizationId),
        eq(employeePayrollPayments.currency, currency),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
        sql`${employeePayrollPayments.expectedAmount}::numeric > 0`,
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    yearMonth: row.yearMonth,
    expectedAmount: row.expectedAmount,
    currency: row.currency,
    dueDate: asBusinessDate(row.dueDate),
  }));
}

function isMissingExpectedCashDateColumn(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return lower.includes('expected_cash_date') && lower.includes('does not exist');
}

export async function loadOpenCommitmentCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly OpenCommitmentCashRow[]> {
  await db.execute(sql`savepoint pf_commitment_cash_date`);
  try {
    const rows = await queryOpenCommitmentCashRows(db, organizationId, currency, true);
    await db.execute(sql`release savepoint pf_commitment_cash_date`);
    return rows;
  } catch (error) {
    await db.execute(sql`rollback to savepoint pf_commitment_cash_date`);
    await db.execute(sql`release savepoint pf_commitment_cash_date`);
    if (!isMissingExpectedCashDateColumn(error)) throw error;
    return queryOpenCommitmentCashRows(db, organizationId, currency, false);
  }
}

async function queryOpenCommitmentCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  includeExpectedCashDate: boolean,
): Promise<readonly OpenCommitmentCashRow[]> {
  const rows = await db
    .select({
      id: committedCosts.id,
      purchaseOrderId: committedCosts.purchaseOrderId,
      reference: purchaseOrders.reference,
      projectId: committedCosts.projectId,
      amount: committedCosts.amount,
      currency: committedCosts.currency,
      expectedCashDate: includeExpectedCashDate ? purchaseOrders.expectedCashDate : sql<string | null>`null`,
    })
    .from(committedCosts)
    .innerJoin(
      purchaseOrders,
      and(
        eq(purchaseOrders.id, committedCosts.purchaseOrderId),
        eq(purchaseOrders.organizationId, committedCosts.organizationId),
      ),
    )
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        eq(committedCosts.currency, currency),
        inArray(committedCosts.status, [...OPEN_COMMITMENT_STATUSES]),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    purchaseOrderId: row.purchaseOrderId,
    reference: row.reference,
    projectId: row.projectId,
    amount: row.amount,
    currency: row.currency,
    expectedCashDate: asBusinessDate(row.expectedCashDate),
  }));
}
