import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { billingRecords, payments } from '@drizzle/schema';
import {
  aggregateBillingPositionInCurrency,
  isOverdueOn,
  recordOutstanding,
  sumInvoicedAmounts,
  sumPaidAmountsForRecord,
  type BillingAmountInput,
  type PaymentAmountInput,
} from '@/modules/billing/domain/outstanding';
import { listPaidAmountRowsByBillingRecordIds } from '@/modules/billing';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';

export interface ProjectBillingRows {
  readonly records: readonly (BillingAmountInput & {
    readonly id: string;
    readonly dueDate: BusinessDate | null;
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
    readonly subtotalAmount: MoneyValue;
  })[];
  readonly currency: string;
}

async function mapBillingRecords(
  db: DbExecutor,
  organizationId: string,
  records: (typeof billingRecords.$inferSelect)[],
): Promise<ProjectBillingRows> {
  if (records.length === 0) {
    return { records: [], currency: '' };
  }

  const currency = records[0]!.currency;
  const recordIds = records.map((record) => record.id);

  const paymentRows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, recordIds);

  const paymentsByRecord = new Map<string, PaymentAmountInput[]>();
  for (const payment of paymentRows) {
    const amount = fromNumericString(payment.amount, payment.currency);
    if (!amount) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push({ amount, status: payment.status });
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  const mapped = records.map((record) => ({
    id: record.id,
    dueDate: record.dueDate ? businessDate(record.dueDate) : null,
    kind: record.kind,
    status: record.status,
    totalAmount: fromNumericString(record.totalAmount, record.currency)!,
    subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
    payments: paymentsByRecord.get(record.id) ?? [],
    retentionHeldRemaining: fromNumericString(record.retentionHeldRemaining, record.currency) ?? undefined,
  }));

  return { records: mapped, currency };
}

export async function loadProjectBillingRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<ProjectBillingRows> {
  const records = await db
    .select()
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.projectId, projectId),
        isNull(billingRecords.archivedAt),
      ),
    );

  return mapBillingRecords(db, organizationId, records);
}

export async function loadOrganizationBillingRows(
  db: DbExecutor,
  organizationId: string,
): Promise<ProjectBillingRows> {
  const records = await db
    .select()
    .from(billingRecords)
    .where(
      and(eq(billingRecords.organizationId, organizationId), isNull(billingRecords.archivedAt)),
    );

  return mapBillingRecords(db, organizationId, records);
}

/**
 * Billing rows grouped by project for set-based org rollup (2 queries total).
 */
export async function loadBillingRowsGroupedByProject(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<Map<string, ProjectBillingRows>> {
  const result = new Map<string, ProjectBillingRows>();
  if (projectIds.length === 0) return result;

  const records = await db
    .select()
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        inArray(billingRecords.projectId, [...projectIds]),
        isNull(billingRecords.archivedAt),
      ),
    );

  const byProject = new Map<string, (typeof billingRecords.$inferSelect)[]>();
  for (const record of records) {
    if (!record.projectId) continue;
    const list = byProject.get(record.projectId) ?? [];
    list.push(record);
    byProject.set(record.projectId, list);
  }

  // One payments query for all record ids, then split per project.
  const allRecordIds = records.map((record) => record.id);
  const paymentRows = await listPaidAmountRowsByBillingRecordIds(db, organizationId, allRecordIds);

  const paymentsByRecord = new Map<string, PaymentAmountInput[]>();
  for (const payment of paymentRows) {
    const amount = fromNumericString(payment.amount, payment.currency);
    if (!amount) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push({ amount, status: payment.status });
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  for (const [projectId, projectRecords] of byProject) {
    if (projectRecords.length === 0) continue;
    const currency = projectRecords[0]!.currency;
    result.set(projectId, {
      currency,
      records: projectRecords.map((record) => ({
        id: record.id,
        dueDate: record.dueDate ? businessDate(record.dueDate) : null,
        kind: record.kind,
        status: record.status,
        totalAmount: fromNumericString(record.totalAmount, record.currency)!,
        subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
        payments: paymentsByRecord.get(record.id) ?? [],
        retentionHeldRemaining:
          fromNumericString(record.retentionHeldRemaining, record.currency) ?? undefined,
      })),
    });
  }

  return result;
}

/** Count overdue invoices from already-loaded billing rows (avoids a second full load). */
export function countOverdueFromBillingRows(
  rows: ProjectBillingRows,
  today: BusinessDate,
): number {
  let overdueCount = 0;
  for (const record of rows.records) {
    if (record.status === 'draft' || record.status === 'void' || !record.dueDate) continue;

    const paid = sumPaidAmountsForRecord(
      record.status,
      record.payments,
      rows.currency || record.totalAmount.currency,
    );
    const outstanding = recordOutstanding(
      record.totalAmount,
      paid,
      record.kind,
      record.status,
      record.retentionHeldRemaining,
    );

    if (isOverdueOn(outstanding, record.dueDate, today)) {
      overdueCount += 1;
    }
  }
  return overdueCount;
}

export function computeBillingPositionFromRows(
  rows: ProjectBillingRows,
  currency: string,
): ReturnType<typeof aggregateBillingPositionInCurrency> {
  return aggregateBillingPositionInCurrency(rows.records, currency);
}

export async function sumInvoicedInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const records = await db
    .select()
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.currency, currency),
        isNull(billingRecords.archivedAt),
        gte(billingRecords.issueDate, fromDate),
        lte(billingRecords.issueDate, toDate),
      ),
    );

  const inputs: BillingAmountInput[] = records.map((record) => ({
    kind: record.kind,
    status: record.status,
    totalAmount: fromNumericString(record.totalAmount, record.currency)!,
  }));

  return sumInvoicedAmounts(inputs, currency);
}

/**
 * Sum of actually recorded payment collections in a date range.
 * Uses paymentDate (when cash was received), not issueDate.
 * "Void" payments are excluded.
 */
export async function sumCollectionsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const rows = await db
    .select({ amount: payments.amount, currency: payments.currency })
    .from(payments)
    .innerJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.currency, currency),
        sql`${payments.status} = 'recorded'`,
        gte(payments.paymentDate, fromDate),
        lte(payments.paymentDate, toDate),
        isNull(billingRecords.archivedAt),
      ),
    );

  let total = { amount: '0', currency };
  for (const row of rows) {
    const amt = fromNumericString(row.amount, row.currency);
    if (!amt || amt.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const sum = parseFloat(total.amount) + parseFloat(amt.amount);
    total = { amount: sum.toFixed(2), currency };
  }
  return { amount: total.amount, currency };
}

export async function countOverdueBillingRecords(
  db: DbExecutor,
  organizationId: string,
  today: BusinessDate,
): Promise<number> {
  const rows = await loadOrganizationBillingRows(db, organizationId);
  return countOverdueFromBillingRows(rows, today);
}

export async function hasAnyBillingUsage(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: billingRecords.id })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        sql`${billingRecords.status} <> 'draft'`,
      ),
    )
    .limit(1);

  return Boolean(row);
}

export interface CashFlowPaymentRow {
  readonly amount: MoneyValue;
  readonly paymentDate: BusinessDate;
  readonly status: 'recorded' | 'void';
  readonly projectId: string | null;
}

/**
 * Recorded/void payments for cash Actual (Paid collected by paymentDate).
 * Optionally scoped to one project via billing_records.project_id.
 */
export async function loadCashFlowPayments(
  db: DbExecutor,
  organizationId: string,
  options: { readonly projectId?: string } = {},
): Promise<CashFlowPaymentRow[]> {
  const conditions = [eq(payments.organizationId, organizationId)];

  if (options.projectId) {
    const rows = await db
      .select({
        amount: payments.amount,
        currency: payments.currency,
        paymentDate: payments.paymentDate,
        status: payments.status,
        projectId: billingRecords.projectId,
      })
      .from(payments)
      .innerJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
      .where(
        and(
          ...conditions,
          eq(billingRecords.organizationId, organizationId),
          eq(billingRecords.projectId, options.projectId),
          isNull(billingRecords.archivedAt),
        ),
      );

    return mapCashFlowPaymentRows(rows);
  }

  const rows = await db
    .select({
      amount: payments.amount,
      currency: payments.currency,
      paymentDate: payments.paymentDate,
      status: payments.status,
      projectId: billingRecords.projectId,
    })
    .from(payments)
    .innerJoin(billingRecords, eq(billingRecords.id, payments.billingRecordId))
    .where(
      and(
        ...conditions,
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
      ),
    );

  return mapCashFlowPaymentRows(rows);
}

function mapCashFlowPaymentRows(
  rows: readonly {
    amount: string;
    currency: string;
    paymentDate: string;
    status: string;
    projectId: string | null;
  }[],
): CashFlowPaymentRow[] {
  const mapped: CashFlowPaymentRow[] = [];
  for (const row of rows) {
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount) continue;
    if (row.status !== 'recorded' && row.status !== 'void') continue;
    mapped.push({
      amount,
      paymentDate: businessDate(row.paymentDate),
      status: row.status,
      projectId: row.projectId,
    });
  }
  return mapped;
}
