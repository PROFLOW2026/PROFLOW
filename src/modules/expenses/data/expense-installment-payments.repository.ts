import { and, eq, inArray } from 'drizzle-orm';
import { auditEvents } from '@drizzle/schema';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { DbExecutor } from '@/shared/db/types';
import type { ExpensePaymentAuditRow } from '../domain/expense-installment-payment-evidence';
import {
  resolveVerifiedInstallmentPayments,
  type VerifiedInstallmentPayment,
} from '../domain/expense-installment-payment-evidence';

const PAYMENT_ACTIONS = [
  AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMED,
  AUDIT_ACTIONS.EXPENSE_PAYMENT_CONFIRMATION_VOIDED,
] as const;

export async function loadExpensePaymentAuditsByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, readonly ExpensePaymentAuditRow[]>> {
  const map = new Map<string, ExpensePaymentAuditRow[]>();
  if (expenseIds.length === 0) return map;

  const rows = await db
    .select({
      entityId: auditEvents.entityId,
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,
      after: auditEvents.after,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        eq(auditEvents.entityType, 'expense'),
        inArray(auditEvents.entityId, [...expenseIds]),
        inArray(auditEvents.action, [...PAYMENT_ACTIONS]),
      ),
    )
    .orderBy(auditEvents.createdAt);

  for (const row of rows) {
    if (!row.entityId) continue;
    const list = map.get(row.entityId) ?? [];
    list.push({
      action: row.action,
      createdAt: row.createdAt.toISOString(),
      after: row.after,
    });
    map.set(row.entityId, list);
  }
  return map;
}

export type ExpenseInstallmentPaymentFields = {
  readonly id: string;
  readonly grossAmount: string;
  readonly currency: string;
  readonly installmentCount: number;
  readonly installmentStartDate: string | null;
  readonly expenseDate: string;
  readonly cashInstallmentSchedule: unknown;
};

export async function loadVerifiedInstallmentPaymentsByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseRows: readonly ExpenseInstallmentPaymentFields[],
): Promise<Map<string, readonly VerifiedInstallmentPayment[]>> {
  const installmentIds = expenseRows
    .filter((row) => row.installmentCount > 1)
    .map((row) => row.id);
  const auditsByExpense = await loadExpensePaymentAuditsByExpenseIds(
    db,
    organizationId,
    installmentIds,
  );

  const map = new Map<string, readonly VerifiedInstallmentPayment[]>();
  for (const row of expenseRows) {
    if (row.installmentCount <= 1) continue;
    const audits = auditsByExpense.get(row.id) ?? [];
    map.set(
      row.id,
      resolveVerifiedInstallmentPayments({
        grossAmount: row.grossAmount,
        currency: row.currency,
        installmentCount: row.installmentCount,
        installmentStartDate: row.installmentStartDate ?? row.expenseDate,
        expenseDate: row.expenseDate,
        cashInstallmentSchedule: row.cashInstallmentSchedule,
        audits,
      }),
    );
  }
  return map;
}
