import { and, eq, inArray, sql } from 'drizzle-orm';
import { auditEvents, expenseInstallmentPayments } from '@drizzle/schema';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { AUDIT_ACTIONS, type AuditAction } from '@/shared/audit/actions';
import { redactSnapshot } from '@/shared/audit';
import { isPostgresPermissionDenied, postgresSqlState } from '@/shared/db/postgres-sql-state';
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
  const byIndexByExpense = new Map<string, Map<number, InstallmentPaymentSlice>>();
  if (expenseIds.length === 0) return new Map();

  const readSavepoint = `expense_installment_ledger_read_${++ledgerSavepointSeq}`;
  await db.execute(sql.raw(`SAVEPOINT "${readSavepoint}"`));
  let rows;
  try {
    rows = await db
      .select({
        id: expenseInstallmentPayments.id,
        expenseId: expenseInstallmentPayments.expenseId,
        installmentIndex: expenseInstallmentPayments.installmentIndex,
        dueDate: expenseInstallmentPayments.dueDate,
        actualPaidAt: expenseInstallmentPayments.actualPaidAt,
        grossPaid: expenseInstallmentPayments.grossPaid,
        status: expenseInstallmentPayments.status,
        paymentReference: expenseInstallmentPayments.paymentReference,
        reversesPaymentId: expenseInstallmentPayments.reversesPaymentId,
      })
      .from(expenseInstallmentPayments)
      .where(
        and(
          eq(expenseInstallmentPayments.organizationId, organizationId),
          inArray(expenseInstallmentPayments.expenseId, [...expenseIds]),
          inArray(expenseInstallmentPayments.status, ['paid', 'voided', 'credited']),
        ),
      )
      .orderBy(expenseInstallmentPayments.installmentIndex, expenseInstallmentPayments.createdAt);
    await db.execute(sql.raw(`RELEASE SAVEPOINT "${readSavepoint}"`));
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${readSavepoint}"`));
    if (isPostgresPermissionDenied(error)) {
      return new Map();
    }
    throw error;
  }

  const reversedGrossByPaymentId = new Map<string, ReturnType<typeof zeroMoney>>();
  for (const row of rows) {
    if (row.status === 'paid' || !row.reversesPaymentId) continue;
    const currency = currencyByExpense.get(row.expenseId ?? '') ?? 'ILS';
    const reversal = fromNumericString(String(row.grossPaid), currency);
    if (!reversal) continue;
    const key = row.reversesPaymentId;
    const prior = reversedGrossByPaymentId.get(key) ?? zeroMoney(currency);
    reversedGrossByPaymentId.set(key, roundMoney(addMoney(prior, reversal)));
  }

  for (const row of rows) {
    if (row.status !== 'paid') continue;
    if (!row.expenseId || row.installmentIndex == null || !row.actualPaidAt) continue;
    const currency = currencyByExpense.get(row.expenseId) ?? 'ILS';
    const gross = fromNumericString(String(row.grossPaid), currency);
    if (!gross) continue;
    const reversed = reversedGrossByPaymentId.get(row.id) ?? zeroMoney(currency);
    const effective = roundMoney(subtractMoney(gross, reversed));
    if (!isPositiveMoney(effective)) continue;
    const byIndex = byIndexByExpense.get(row.expenseId) ?? new Map<number, InstallmentPaymentSlice>();
    byIndex.set(row.installmentIndex, {
      installmentIndex: row.installmentIndex,
      dueDate: row.dueDate ? businessDate(String(row.dueDate)) : null,
      actualPaidAt: businessDate(String(row.actualPaidAt)),
      grossPaid: effective,
      verification: 'verified',
      source: 'ledger',
      paymentReference: row.paymentReference,
    });
    byIndexByExpense.set(row.expenseId, byIndex);
  }
  const slicesByExpense = new Map<string, InstallmentPaymentSlice[]>();
  for (const [expenseId, byIndex] of byIndexByExpense) {
    slicesByExpense.set(
      expenseId,
      [...byIndex.values()].sort((a, b) => a.installmentIndex - b.installmentIndex),
    );
  }
  return slicesByExpense;
}

function isUniqueViolation(error: unknown): boolean {
  return postgresSqlState(error) === '23505';
}

let ledgerSavepointSeq = 0;

async function runLedgerInsertOrIgnoreUnique(
  db: DbExecutor,
  insert: () => Promise<void>,
): Promise<void> {
  const savepoint = `expense_installment_ledger_${++ledgerSavepointSeq}`;
  await db.execute(sql.raw(`SAVEPOINT "${savepoint}"`));
  try {
    await insert();
    await db.execute(sql.raw(`RELEASE SAVEPOINT "${savepoint}"`));
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${savepoint}"`));
    if (isUniqueViolation(error)) return;
    throw error;
  }
}

function netAndVatFromPaymentGross(
  grossPaid: MoneyValue,
  expenseNetAmount: string,
  expenseGrossAmount: string,
): { readonly netPaid: MoneyValue; readonly vatPaid: MoneyValue } {
  const currency = grossPaid.currency;
  const netTotal = fromNumericString(expenseNetAmount, currency);
  const grossTotal = fromNumericString(expenseGrossAmount, currency);
  if (!netTotal || !grossTotal || !isPositiveMoney(grossTotal)) {
    return { netPaid: grossPaid, vatPaid: zeroMoney(currency) };
  }
  const ratio = Number(netTotal.amount) / Number(grossTotal.amount);
  const netPaid = roundMoney(money(String(Number(grossPaid.amount) * ratio), currency));
  const vatPaid = roundMoney(subtractMoney(grossPaid, netPaid));
  return { netPaid, vatPaid };
}

export async function writeExpensePaymentAuditEvent(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly actorUserId: string | null;
    readonly action: AuditAction;
    readonly entityId: string;
    readonly before?: unknown;
    readonly after?: unknown;
  },
): Promise<string> {
  const [row] = await db
    .insert(auditEvents)
    .values({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: 'expense',
      entityId: input.entityId,
      before: input.before === undefined ? null : redactSnapshot(input.before),
      after: input.after === undefined ? null : redactSnapshot(input.after),
    })
    .returning({ id: auditEvents.id });
  return row!.id;
}

export type RecordInstallmentPaymentLedgerInput = {
  readonly organizationId: string;
  readonly expenseId: string;
  readonly installmentIndex: number | null;
  readonly dueDate: BusinessDate | null;
  readonly actualPaidAt: BusinessDate;
  readonly grossPaid: MoneyValue;
  readonly expenseNetAmount: string;
  readonly expenseGrossAmount: string;
  readonly paymentReference: string | null;
  readonly auditEventId: string;
};

/** Append paid row to expense_installment_payments (0180). Idempotent per audit event. */
export async function recordInstallmentPaymentPaidLedgerRow(
  db: DbExecutor,
  input: RecordInstallmentPaymentLedgerInput,
): Promise<void> {
  const { netPaid, vatPaid } = netAndVatFromPaymentGross(
    input.grossPaid,
    input.expenseNetAmount,
    input.expenseGrossAmount,
  );
  const indexKey = input.installmentIndex == null ? 'lump' : String(input.installmentIndex);
  const idempotencyKey = `expense:${input.expenseId}:inst:${indexKey}:${input.auditEventId}`;

  await runLedgerInsertOrIgnoreUnique(db, async () => {
    await db.insert(expenseInstallmentPayments).values({
      organizationId: input.organizationId,
      expenseId: input.expenseId,
      installmentIndex: input.installmentIndex,
      dueDate: input.dueDate,
      actualPaidAt: input.actualPaidAt,
      grossPaid: input.grossPaid.amount,
      netPaid: netPaid.amount,
      vatPaid: vatPaid.amount,
      status: 'paid',
      paymentReference: input.paymentReference,
      auditEventId: input.auditEventId,
      idempotencyKey,
    });
  });
}

/** Void every effective paid ledger row for an expense (full payment confirmation void). */
export async function voidInstallmentPaymentLedgerForExpense(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly expenseId: string;
    readonly auditEventId: string;
  },
): Promise<void> {
  const readSavepoint = `expense_installment_ledger_void_read_${++ledgerSavepointSeq}`;
  await db.execute(sql.raw(`SAVEPOINT "${readSavepoint}"`));
  let paidRows;
  try {
    paidRows = await db
      .select({
        id: expenseInstallmentPayments.id,
        installmentIndex: expenseInstallmentPayments.installmentIndex,
        grossPaid: expenseInstallmentPayments.grossPaid,
        netPaid: expenseInstallmentPayments.netPaid,
        vatPaid: expenseInstallmentPayments.vatPaid,
      })
      .from(expenseInstallmentPayments)
      .where(
        and(
          eq(expenseInstallmentPayments.organizationId, input.organizationId),
          eq(expenseInstallmentPayments.expenseId, input.expenseId),
          eq(expenseInstallmentPayments.status, 'paid'),
        ),
      );
    await db.execute(sql.raw(`RELEASE SAVEPOINT "${readSavepoint}"`));
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${readSavepoint}"`));
    if (isPostgresPermissionDenied(error)) return;
    throw error;
  }

  for (const paid of paidRows) {
    const idempotencyKey = `void:${paid.id}:${input.auditEventId}`;
    await runLedgerInsertOrIgnoreUnique(db, async () => {
      await db.insert(expenseInstallmentPayments).values({
        organizationId: input.organizationId,
        expenseId: input.expenseId,
        installmentIndex: paid.installmentIndex,
        grossPaid: paid.grossPaid,
        netPaid: paid.netPaid,
        vatPaid: paid.vatPaid,
        status: 'voided',
        reversesPaymentId: paid.id,
        auditEventId: input.auditEventId,
        idempotencyKey,
      });
    });
  }
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
  const auditsByExpense = await loadExpensePaymentAuditsByExpenseIds(db, organizationId, expenseIds);
  const ledgerByExpense = await loadLedgerSlicesByExpenseIds(
    db,
    organizationId,
    expenseIds,
    currencyByExpense,
  );

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
  const auditsByExpense = await loadExpensePaymentAuditsByExpenseIds(db, organizationId, expenseIds);
  const ledgerByExpense = await loadLedgerSlicesByExpenseIds(
    db,
    organizationId,
    expenseIds,
    currencyByExpense,
  );

  const map = new Map<string, readonly InstallmentPaymentSlice[]>();
  for (const row of installmentRows) {
    const audits = auditsByExpense.get(row.id) ?? [];
    const ledgerSlices = ledgerByExpense.get(row.id) ?? [];
    map.set(row.id, resolveVerifiedInstallmentPayments(resolutionInput(row, audits, ledgerSlices)));
  }
  return map;
}
