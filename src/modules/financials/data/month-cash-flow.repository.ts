/**
 * Month cash facts. Expenses matched to a recognized vendor bill are omitted
 * so the AP payment is the only cash line.
 */

import { and, eq, gte, inArray, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  apBills,
  apPayments,
  apPoMatches,
  costCategories,
  employeePayrollPayments,
  employees,
  expenses,
  organizationCatalogEntries,
  subcontractAdvances,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import { businessDate, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { sqlRows } from './sql-rows';
import type {
  MonthAdvanceCashSnapshot,
  MonthCashExpectedLine,
  MonthCashPaidLine,
  MonthExpenseCashSnapshot,
  MonthPayrollCashSnapshot,
} from '../domain/month-cash-flow';

const RECOGNIZED_AP_STATUSES = ['open', 'partially_matched', 'matched'] as const;
const PAID_ADVANCE_STATUSES = [
  'paid',
  'partially_applied',
  'fully_applied',
  'partially_refunded',
  'fully_refunded',
] as const;

export interface MonthApBillDueRow {
  readonly id: string;
  readonly party: string;
  readonly document: string;
  readonly dueDate: BusinessDate;
  readonly paymentTerms: string | null;
  readonly status: string;
  readonly totalAmount: string;
  readonly currency: string;
  readonly appliedPayments: string;
  readonly appliedCredits: string;
  readonly retentionHeldRemaining: string;
}

function asDate(value: string | null): BusinessDate | null {
  return value ? businessDate(value) : null;
}

export async function loadMonthApPayments(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<readonly MonthCashPaidLine[]> {
  const rows = await db
    .select({
      id: apPayments.id,
      amount: apPayments.amount,
      currency: apPayments.currency,
      paymentDate: apPayments.paymentDate,
      method: apPayments.method,
      reference: apPayments.reference,
      vendorName: vendors.name,
    })
    .from(apPayments)
    .innerJoin(
      vendors,
      and(eq(vendors.id, apPayments.vendorId), eq(vendors.organizationId, apPayments.organizationId)),
    )
    .where(
      and(
        eq(apPayments.organizationId, organizationId),
        eq(apPayments.currency, currency),
        eq(apPayments.status, 'recorded'),
        gte(apPayments.paymentDate, from),
        lte(apPayments.paymentDate, to),
      ),
    );

  return rows.map((row) => ({
    id: `ap:${row.id}`,
    source: 'ap' as const,
    party: row.vendorName,
    document: row.reference?.trim() || row.method?.trim() || row.id,
    paymentDate: businessDate(row.paymentDate),
    amount: { amount: row.amount, currency: row.currency },
    reference: row.method,
  }));
}

export async function loadMonthApBillsDue(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<readonly MonthApBillDueRow[]> {
  const result = await db.execute(sql`
    SELECT
      b.id,
      v.name AS party,
      coalesce(nullif(b.reference, ''), b.id::text) AS document,
      b.due_date,
      c.name AS payment_terms,
      b.status,
      b.total_amount::text AS total_amount,
      b.currency,
      b.retention_held_remaining::text AS retention_held_remaining,
      coalesce((
        SELECT sum(a.applied_amount)
        FROM ap_payment_applications a
        INNER JOIN ap_payments p
          ON p.id = a.ap_payment_id
         AND p.organization_id = a.organization_id
        WHERE a.organization_id = b.organization_id
          AND a.ap_bill_id = b.id
          AND p.status = 'recorded'
      ), 0)::text AS applied_payments,
      coalesce((
        SELECT sum(ca.amount)
        FROM ap_credit_applications ca
        WHERE ca.organization_id = b.organization_id
          AND ca.ap_bill_id = b.id
          AND ca.status = 'applied'
      ), 0)::text AS applied_credits
    FROM ap_bills b
    INNER JOIN vendors v
      ON v.id = b.vendor_id
     AND v.organization_id = b.organization_id
    LEFT JOIN organization_catalog_entries c
      ON c.id = b.payment_term_id
     AND c.organization_id = b.organization_id
    WHERE b.organization_id = ${organizationId}
      AND b.currency = ${currency}
      AND b.archived_at IS NULL
      AND b.status IN ('open', 'partially_matched', 'matched')
      AND b.due_date >= ${from}
      AND b.due_date <= ${to}
  `);

  return sqlRows<{
    id: string;
    party: string;
    document: string;
    due_date: string;
    payment_terms: string | null;
    status: string;
    total_amount: string;
    currency: string;
    retention_held_remaining: string;
    applied_payments: string;
    applied_credits: string;
  }>(result).map((row) => ({
    id: row.id,
    party: row.party,
    document: row.document,
    dueDate: businessDate(row.due_date),
    paymentTerms: row.payment_terms,
    status: row.status,
    totalAmount: row.total_amount,
    currency: row.currency,
    appliedPayments: row.applied_payments,
    appliedCredits: row.applied_credits,
    retentionHeldRemaining: row.retention_held_remaining,
  }));
}

export async function loadMonthExpenseCashSnapshots(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly MonthExpenseCashSnapshot[]> {
  const reversal = alias(expenses, 'expense_reversal');
  const rows = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      supplierName: expenses.supplierName,
      grossAmount: expenses.grossAmount,
      currency: expenses.currency,
      expenseDate: expenses.expenseDate,
      dueDate: expenses.dueDate,
      paymentTerms: organizationCatalogEntries.name,
      installmentCount: expenses.installmentCount,
      installmentStartDate: expenses.installmentStartDate,
      installmentsPaidCount: expenses.installmentsPaidCount,
      paidGrossAmount: expenses.paidGrossAmount,
      paidAt: expenses.paidAt,
      paymentMethod: expenses.paymentMethod,
    })
    .from(expenses)
    .leftJoin(costCategories, eq(costCategories.id, expenses.costCategoryId))
    .leftJoin(
      organizationCatalogEntries,
      and(
        eq(organizationCatalogEntries.id, expenses.paymentTermId),
        eq(organizationCatalogEntries.organizationId, expenses.organizationId),
      ),
    )
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        eq(expenses.currency, currency),
        isNull(expenses.archivedAt),
        eq(expenses.isRecurringTemplate, false),
        isNull(expenses.voidsExpenseId),
        or(isNull(costCategories.key), sql`${costCategories.key} <> 'internal_employee_payroll'`),
        notExists(
          db
            .select({ id: apPoMatches.id })
            .from(apPoMatches)
            .innerJoin(
              apBills,
              and(eq(apBills.id, apPoMatches.apBillId), eq(apBills.organizationId, apPoMatches.organizationId)),
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
    party: row.supplierName?.trim() || row.description?.trim() || row.id,
    document: row.description?.trim() || row.id,
    grossAmount: row.grossAmount,
    currency: row.currency,
    expenseDate: businessDate(row.expenseDate),
    dueDate: asDate(row.dueDate),
    paymentTerms: row.paymentTerms,
    installmentCount: row.installmentCount,
    installmentStartDate: asDate(row.installmentStartDate),
    installmentsPaidCount: row.installmentsPaidCount,
    paidGrossAmount: row.paidGrossAmount,
    paidAt: asDate(row.paidAt),
    paymentMethod: row.paymentMethod,
    recognizedApMatch: false,
    voided: false,
  }));
}

export async function loadMonthPayrollCashSnapshots(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<readonly MonthPayrollCashSnapshot[]> {
  const rows = await db
    .select({
      id: employeePayrollPayments.id,
      employeeName: employees.name,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      paidAmount: employeePayrollPayments.paidAmount,
      currency: employeePayrollPayments.currency,
      dueDate: employeePayrollPayments.dueDate,
      paidAt: employeePayrollPayments.paidAt,
      voidedAt: employeePayrollPayments.voidedAt,
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
        isNull(employeePayrollPayments.voidedAt),
        or(
          and(gte(employeePayrollPayments.paidAt, from), lte(employeePayrollPayments.paidAt, to)),
          and(gte(employeePayrollPayments.dueDate, from), lte(employeePayrollPayments.dueDate, to)),
        ),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    party: row.employeeName,
    document: row.yearMonth,
    expectedAmount: row.expectedAmount,
    paidAmount: row.paidAmount,
    currency: row.currency,
    dueDate: asDate(row.dueDate),
    paidAt: asDate(row.paidAt),
    voided: row.voidedAt != null,
  }));
}

export async function loadMonthAdvanceCashSnapshots(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  from: BusinessDate,
  to: BusinessDate,
): Promise<readonly MonthAdvanceCashSnapshot[]> {
  const rows = await db
    .select({
      id: subcontractAdvances.id,
      amount: subcontractAdvances.amount,
      currency: subcontractAdvances.currency,
      paidDate: subcontractAdvances.paidDate,
      status: subcontractAdvances.status,
      title: subcontractAgreements.title,
      vendorName: vendors.name,
    })
    .from(subcontractAdvances)
    .innerJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractAdvances.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, subcontractAdvances.organizationId),
      ),
    )
    .innerJoin(
      vendors,
      and(
        eq(vendors.id, subcontractAgreements.vendorId),
        eq(vendors.organizationId, subcontractAgreements.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractAdvances.organizationId, organizationId),
        eq(subcontractAdvances.currency, currency),
        isNull(subcontractAdvances.archivedAt),
        inArray(subcontractAdvances.status, [...PAID_ADVANCE_STATUSES]),
        gte(subcontractAdvances.paidDate, from),
        lte(subcontractAdvances.paidDate, to),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    party: row.vendorName,
    document: row.title,
    amount: row.amount,
    currency: row.currency,
    paidDate: asDate(row.paidDate),
    status: row.status,
    reference: null,
  }));
}

export function apExpectedLineFromBill(
  row: MonthApBillDueRow,
  remaining: { readonly amount: string; readonly currency: string },
  status: string,
): MonthCashExpectedLine {
  return {
    id: `ap:${row.id}`,
    source: 'ap',
    party: row.party,
    document: row.document,
    dueDate: row.dueDate,
    paymentTerms: row.paymentTerms,
    remaining,
    status,
  };
}
