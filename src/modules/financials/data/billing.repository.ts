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
import { businessDate, type BusinessDate } from '@/shared/dates';
import { fromNumericString, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';

export interface ProjectBillingRows {
  readonly records: readonly (BillingAmountInput & {
    readonly id: string;
    readonly dueDate: BusinessDate | null;
    readonly payments: readonly PaymentAmountInput[];
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

  const paymentRows = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.organizationId, organizationId), inArray(payments.billingRecordId, recordIds)),
    );

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
    payments: paymentsByRecord.get(record.id) ?? [],
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

export async function countOverdueBillingRecords(
  db: DbExecutor,
  organizationId: string,
  today: BusinessDate,
): Promise<number> {
  const rows = await loadOrganizationBillingRows(db, organizationId);

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
    );

    if (isOverdueOn(outstanding, record.dueDate, today)) {
      overdueCount += 1;
    }
  }

  return overdueCount;
}

export async function hasAnyBillingUsage(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        sql`${billingRecords.status} <> 'draft'`,
      ),
    );

  return (row?.count ?? 0) > 0;
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
