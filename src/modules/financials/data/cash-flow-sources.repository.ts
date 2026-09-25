/**
 * Dated cash obligations for the 90-day forecast.
 * Operating expenses exclude AP-matched rows and internal payroll (those cash paths are separate).
 */

import { and, eq, inArray, isNull, notExists, or, sql } from 'drizzle-orm';
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
} from '@drizzle/schema';
import { businessDate, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type {
  OpenCommitmentCashRow,
  OperatingExpenseCashRow,
  PayrollObligationCashRow,
} from '../domain/cash-flow-sources';

const RECOGNIZED_AP_STATUSES = ['open', 'partially_matched', 'matched'] as const;
const OPEN_COMMITMENT_STATUSES = ['open', 'partially_consumed'] as const;

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
            .select({ id: apPoMatches.id })
            .from(apPoMatches)
            .innerJoin(
              apBills,
              and(
                eq(apBills.id, apPoMatches.apBillId),
                eq(apBills.organizationId, apPoMatches.organizationId),
              ),
            )
            .where(
              and(
                eq(apPoMatches.organizationId, organizationId),
                eq(apPoMatches.expenseId, expenses.id),
                eq(apPoMatches.status, 'accepted'),
                inArray(apBills.status, [...RECOGNIZED_AP_STATUSES]),
                isNull(apBills.archivedAt),
              ),
            ),
        ),
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

  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    projectId: row.projectId,
    grossAmount: row.grossAmount,
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

export async function loadOpenCommitmentCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly OpenCommitmentCashRow[]> {
  const rows = await db
    .select({
      id: committedCosts.id,
      purchaseOrderId: committedCosts.purchaseOrderId,
      reference: purchaseOrders.reference,
      projectId: committedCosts.projectId,
      amount: committedCosts.amount,
      currency: committedCosts.currency,
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
  }));
}
