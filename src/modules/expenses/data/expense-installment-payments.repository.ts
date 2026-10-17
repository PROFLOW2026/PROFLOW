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
import { logger } from '@/shared/observability';
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

function readSqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

function postgresCauseMessage(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const record = current as { message?: unknown; cause?: unknown };
    if (depth > 0 && typeof record.message === 'string' && record.message.length > 0) {
      return record.message;
    }
    current = record.cause;
  }
  return undefined;
}

/** Keep only the payment fields recognition reads, and coerce index text to a number. */
export function normalizePaymentAuditAfter(value: unknown): unknown {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown;
        } catch {
          return null;
        }
      })()
    : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed ?? null;
  const record = { ...(parsed as Record<string, unknown>) };
  const rawIndex = record.installmentIndex ?? record.installment_index;
  if (typeof rawIndex === 'string' && /^-?\d+$/.test(rawIndex)) {
    record.installmentIndex = Number(rawIndex);
  }
  return record;
}

/**
 * Payment-confirmation audits for installment recognition.
 *
 * The previous Drizzle `IN` list mixed uuid and text parameters. On the
 * production pooler (`prepare: false`) that statement failed inside the
 * attendance transaction and rolled the whole retroactive save back.
 * Cast both arrays explicitly, and if the read still fails, roll back only
 * this statement so the ledger read and the attendance write can continue.
 */
export async function loadExpensePaymentAuditsByExpenseIds(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, readonly ExpensePaymentAuditRow[]>> {
  const map = new Map<string, ExpensePaymentAuditRow[]>();
  if (expenseIds.length === 0) return map;

  const readSavepoint = `expense_payment_audit_read_${++ledgerSavepointSeq}`;
  await db.execute(sql.raw(`SAVEPOINT "${readSavepoint}"`));
  try {
    const rows = readSqlRows<{
      entity_id: string | null;
      action: string;
      created_at: Date | string;
      after: unknown;
    }>(
      await db.execute(sql`
        select
          entity_id,
          action,
          created_at,
          case
            when after is null then null
            else jsonb_build_object(
              'paidAt', after->>'paidAt',
              'paid_at', after->>'paid_at',
              'paidGrossAmount', coalesce(after->>'paidGrossAmount', after->>'paid_gross_amount'),
              'installmentIndex', coalesce(after->>'installmentIndex', after->>'installment_index'),
              'source', after->>'source'
            )
          end as after
        from audit_events
        where organization_id = ${organizationId}::uuid
          and entity_type = 'expense'
          and entity_id = any(${[...expenseIds]}::uuid[])
          and action = any(${[...PAYMENT_ACTIONS]}::text[])
        order by created_at
      `),
    );
    await db.execute(sql.raw(`RELEASE SAVEPOINT "${readSavepoint}"`));

    for (const row of rows) {
      if (!row.entity_id) continue;
      const createdAt = row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
      const list = map.get(row.entity_id) ?? [];
      list.push({
        action: row.action,
        createdAt,
        after: normalizePaymentAuditAfter(row.after),
      });
      map.set(row.entity_id, list);
    }
    return map;
  } catch (error) {
    await db.execute(sql.raw(`ROLLBACK TO SAVEPOINT "${readSavepoint}"`));
    logger.error('expenses.payment_audit_read_failed', {
      sqlState: postgresSqlState(error) ?? null,
      message: error instanceof Error ? error.message : String(error),
      cause: postgresCauseMessage(error) ?? null,
    });
    return map;
  }
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
