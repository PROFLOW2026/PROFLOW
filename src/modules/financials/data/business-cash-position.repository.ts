/**
 * Organization business cash position loaders.
 * Expenses linked to recognized AP bills are excluded from expense cash (AP is authoritative).
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { employeePayrollPayments, subcontractAdvances } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { sqlFirstRow, sqlRows } from './sql-rows';
import type { ExpenseCashRow } from '../domain/business-cash-position';

export async function loadOrganizationExpenseCashRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly ExpenseCashRow[]> {
  const result = await db.execute(sql`
    SELECT
      e.gross_amount::text AS gross_amount,
      e.paid_gross_amount::text AS paid_gross_amount,
      e.currency,
      cc.key AS category_key
    FROM expenses e
    LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
    WHERE e.organization_id = ${organizationId}
      AND e.currency = ${currency}
      AND e.status = 'finalized'
      AND e.archived_at IS NULL
      AND e.voids_expense_id IS NULL
      AND e.gross_amount::numeric > 0
      AND coalesce(cc.key, '') <> 'internal_employee_payroll'
      AND NOT EXISTS (
        SELECT 1
        FROM ap_po_matches m
        INNER JOIN ap_bills b
          ON b.id = m.ap_bill_id
          AND b.organization_id = m.organization_id
        WHERE m.organization_id = ${organizationId}
          AND m.expense_id = e.id
          AND m.status = 'accepted'
          AND b.status IN ('open', 'partially_matched', 'matched')
          AND b.archived_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1
        FROM expenses rev
        WHERE rev.organization_id = ${organizationId}
          AND rev.voids_expense_id = e.id
          AND rev.archived_at IS NULL
      )
  `);

  return sqlRows<{
    gross_amount: string;
    paid_gross_amount: string | null;
    currency: string;
    category_key: string | null;
  }>(result).map((row) => ({
    grossAmount: row.gross_amount,
    paidGrossAmount: row.paid_gross_amount,
    currency: row.currency,
    categoryKey: row.category_key,
  }));
}

export async function sumOrganizationPayrollCashPaid(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${employeePayrollPayments.paidAmount}), 0)::text`,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, organizationId),
        eq(employeePayrollPayments.currency, currency),
        sql`${employeePayrollPayments.paidAt} IS NOT NULL`,
        isNull(employeePayrollPayments.voidedAt),
      ),
    );
  return row?.total ?? '0';
}

export async function sumOrganizationPayrollCashOutstanding(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${employeePayrollPayments.expectedAmount}), 0)::text`,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, organizationId),
        eq(employeePayrollPayments.currency, currency),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
        sql`${employeePayrollPayments.expectedAmount}::numeric > 0`,
      ),
    );
  return row?.total ?? '0';
}

export async function sumOrganizationSubcontractAdvancesPaid(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<string> {
  const row = sqlFirstRow<{ total: string }>(
    await db
      .select({
        total: sql<string>`coalesce(sum(${subcontractAdvances.amount}), 0)::text`,
      })
      .from(subcontractAdvances)
      .where(
        and(
          eq(subcontractAdvances.organizationId, organizationId),
          eq(subcontractAdvances.currency, currency),
          isNull(subcontractAdvances.archivedAt),
          sql`${subcontractAdvances.paidDate} IS NOT NULL`,
          inArray(subcontractAdvances.status, [
            'paid',
            'partially_applied',
            'fully_applied',
            'partially_refunded',
            'fully_refunded',
          ]),
        ),
      ),
  );
  return row?.total ?? '0';
}
