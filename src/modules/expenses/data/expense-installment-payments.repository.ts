import { and, eq, inArray } from 'drizzle-orm';
import { auditEvents, expenseInstallmentPayments } from '@drizzle/schema';
import { businessDate } from '@/shared/dates';
import { fromNumericString, roundMoney } from '@/shared/money';
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

async function loadLedgerSlicesByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
  currencyByExpense: ReadonlyMap<string, string>,
): Promise<Map<string, InstallmentPaymentSlice[]>> {
  const map = new Map<string, InstallmentPaymentSlice[]>();
  if (expenseIds.length === 0) return map;

  const rows = await db
    .select({
      expenseId: expenseInstallmentPayments.expenseId,
      installmentIndex: expenseInstallmentPayments.installmentIndex,
      dueDate: expenseInstallmentPayments.dueDate,
      actualPaidAt: expenseInstallmentPayments.actualPaidAt,
      grossPaid: expenseInstallmentPayments.grossPaid,
      status: expenseInstallmentPayments.status,
      paymentReference: expenseInstallmentPayments.paymentReference,
    })
    .from(expenseInstallmentPayments)
    .where(
      and(
        eq(expenseInstallmentPayments.organizationId, organizationId),
        inArray(expenseInstallmentPayments.expenseId, [...expenseIds]),
        eq(expenseInstallmentPayments.status, 'paid'),
      ),
    )
    .orderBy(expenseInstallmentPayments.installmentIndex, expenseInstallmentPayments.createdAt);

  for (const row of rows) {
    if (!row.expenseId || row.installmentIndex == null || !row.actualPaidAt) continue;
    const currency = currencyByExpense.get(row.expenseId) ?? 'ILS';
    const gross = fromNumericString(String(row.grossPaid), currency);
    if (!gross) continue;
    const list = map.get(row.expenseId) ?? [];
    list.push({
      installmentIndex: row.installmentIndex,
      dueDate: row.dueDate ? businessDate(String(row.dueDate)) : null,
      actualPaidAt: businessDate(String(row.actualPaidAt)),
      grossPaid: roundMoney(gross),
      verification: 'verified',
      source: 'ledger',
      paymentReference: row.paymentReference,
    });
    map.set(row.expenseId, list);
  }
  return map;
}

function resolutionInput(
  row: ExpenseInstallmentPaymentFields,
  audits: readonly ExpensePaymentAuditRow[],
  ledgerSlices: readonly InstallmentPaymentSlice[],
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
    ledgerSlices,
  };
}

export async function loadInstallmentPaymentStateByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseRows: readonly ExpenseInstallmentPaymentFields[],
): Promise<Map<string, InstallmentPaymentResolution>> {
  const installmentRows = expenseRows.filter((row) => row.installmentCount > 1);
  const expenseIds = installmentRows.map((row) => row.id);
  const currencyByExpense = new Map(installmentRows.map((row) => [row.id, row.currency]));
  const [auditsByExpense, ledgerByExpense] = await Promise.all([
    loadExpensePaymentAuditsByExpenseIds(db, organizationId, expenseIds),
    loadLedgerSlicesByExpenseIds(db, organizationId, expenseIds, currencyByExpense),
  ]);

  const map = new Map<string, InstallmentPaymentResolution>();
  for (const row of installmentRows) {
    const audits = auditsByExpense.get(row.id) ?? [];
    const ledgerSlices = ledgerByExpense.get(row.id) ?? [];
    map.set(row.id, resolveInstallmentPaymentState(resolutionInput(row, audits, ledgerSlices)));
  }
  return map;
}

export async function loadVerifiedInstallmentPaymentsByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseRows: readonly ExpenseInstallmentPaymentFields[],
): Promise<Map<string, readonly InstallmentPaymentSlice[]>> {
  const installmentRows = expenseRows.filter((row) => row.installmentCount > 1);
  const expenseIds = installmentRows.map((row) => row.id);
  const currencyByExpense = new Map(installmentRows.map((row) => [row.id, row.currency]));
  const [auditsByExpense, ledgerByExpense] = await Promise.all([
    loadExpensePaymentAuditsByExpenseIds(db, organizationId, expenseIds),
    loadLedgerSlicesByExpenseIds(db, organizationId, expenseIds, currencyByExpense),
  ]);

  const map = new Map<string, readonly InstallmentPaymentSlice[]>();
  for (const row of installmentRows) {
    const audits = auditsByExpense.get(row.id) ?? [];
    const ledgerSlices = ledgerByExpense.get(row.id) ?? [];
    map.set(row.id, resolveVerifiedInstallmentPayments(resolutionInput(row, audits, ledgerSlices)));
  }
  return map;
}
