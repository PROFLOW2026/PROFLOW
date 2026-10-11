import { and, eq, inArray } from 'drizzle-orm';
import { auditEvents } from '@drizzle/schema';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { DbExecutor } from '@/shared/db/types';
import type { ExpensePaymentAuditRow } from '../domain/expense-installment-payment-evidence';
import {
  resolveInstallmentPaymentState,
  resolveVerifiedInstallmentPayments,
  type InstallmentPaymentResolution,
  type InstallmentPaymentSlice,
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
  readonly installmentsPaidCount: number;
  readonly paidGrossAmount: string | null;
  readonly paidAt: string | null;
};

function resolutionInput(
  row: ExpenseInstallmentPaymentFields,
  audits: readonly ExpensePaymentAuditRow[],
) {
  return {
    grossAmount: row.grossAmount,
    currency: row.currency,
    installmentCount: row.installmentCount,
    installmentStartDate: row.installmentStartDate ?? row.expenseDate,
    expenseDate: row.expenseDate,
    cashInstallmentSchedule: row.cashInstallmentSchedule,
    installmentsPaidCount: row.installmentsPaidCount,
    paidGrossAmount: row.paidGrossAmount,
    paidAt: row.paidAt,
    audits,
  };
}

export async function loadInstallmentPaymentStateByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseRows: readonly ExpenseInstallmentPaymentFields[],
): Promise<Map<string, InstallmentPaymentResolution>> {
  const installmentRows = expenseRows.filter((row) => row.installmentCount > 1);
  const auditsByExpense = await loadExpensePaymentAuditsByExpenseIds(
    db,
    organizationId,
    installmentRows.map((row) => row.id),
  );

  const map = new Map<string, InstallmentPaymentResolution>();
  for (const row of installmentRows) {
    const audits = auditsByExpense.get(row.id) ?? [];
    map.set(row.id, resolveInstallmentPaymentState(resolutionInput(row, audits)));
  }
  return map;
}

export async function loadVerifiedInstallmentPaymentsByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseRows: readonly ExpenseInstallmentPaymentFields[],
): Promise<Map<string, readonly InstallmentPaymentSlice[]>> {
  const installmentRows = expenseRows.filter((row) => row.installmentCount > 1);
  const auditsByExpense = await loadExpensePaymentAuditsByExpenseIds(
    db,
    organizationId,
    installmentRows.map((row) => row.id),
  );

  const map = new Map<string, readonly InstallmentPaymentSlice[]>();
  for (const row of installmentRows) {
    const audits = auditsByExpense.get(row.id) ?? [];
    map.set(row.id, resolveVerifiedInstallmentPayments(resolutionInput(row, audits)));
  }
  return map;
}
