import { and, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { billingRecords, paymentApplications, payments } from '@drizzle/schema';
import {
  aggregateBillingPositionInCurrency,
  isOverdueOn,
  recordNetOutstanding,
  sumInvoicedAmounts,
  sumNetInvoicedAmounts,
  type BillingAmountInput,
  type PaymentAmountInput,
} from '@/modules/billing/domain/outstanding';
import {
  resolvePaymentTriplet,
  zeroTriplet,
  type RevenueTriplet,
} from '@/modules/billing/domain/revenue-position';
import { listPaidAmountRowsByBillingRecordIds } from '@/modules/billing';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { fromNumericString, multiplyMoney, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';

export interface ProjectBillingRows {
  readonly records: readonly (BillingAmountInput & {
    readonly id: string;
    readonly dueDate: BusinessDate | null;
    readonly payments: readonly PaymentAmountInput[];
    readonly retentionHeldRemaining?: MoneyValue;
    readonly subtotalAmount: MoneyValue;
    readonly taxAmount?: MoneyValue | null;
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
    list.push({ amount, amountBasis: payment.amountBasis, status: payment.status });
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  const mapped = records.map((record) => ({
    id: record.id,
    dueDate: record.dueDate ? businessDate(record.dueDate) : null,
    kind: record.kind,
    status: record.status,
    totalAmount: fromNumericString(record.totalAmount, record.currency)!,
    subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
    taxAmount: record.taxAmount
      ? fromNumericString(record.taxAmount, record.currency)
      : null,
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
    list.push({ amount, amountBasis: payment.amountBasis, status: payment.status });
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
        taxAmount: record.taxAmount
          ? fromNumericString(record.taxAmount, record.currency)
          : null,
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

    const outstanding = recordNetOutstanding(record, rows.currency || record.totalAmount.currency);

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

  const inputs: (BillingAmountInput & {
    readonly subtotalAmount: MoneyValue;
    readonly taxAmount: MoneyValue | null;
  })[] = records.map((record) => ({
    kind: record.kind,
    status: record.status,
    totalAmount: fromNumericString(record.totalAmount, record.currency)!,
    subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
    taxAmount: record.taxAmount
      ? fromNumericString(record.taxAmount, record.currency)
      : null,
  }));

  // Period "billed" / revenue KPIs are NET (ex-VAT). GROSS is for AR only.
  return sumNetInvoicedAmounts(inputs, currency);
}

export async function sumGrossInvoicedInDateRange(
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
    subtotalAmount: fromNumericString(record.subtotalAmount, record.currency)!,
    taxAmount: record.taxAmount
      ? fromNumericString(record.taxAmount, record.currency)
      : null,
  }));

  return sumInvoicedAmounts(inputs, currency);
}

/** Canonical NET/VAT/GROSS collections by paymentDate. */
export async function sumCollectionTripletsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<RevenueTriplet> {
  const paymentRows = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      amountBasis: payments.amountBasis,
      paymentCurrency: payments.currency,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        eq(payments.currency, currency),
        sql`${payments.status} = 'recorded'`,
        gte(payments.paymentDate, fromDate),
        lte(payments.paymentDate, toDate),
      ),
    );

  if (paymentRows.length === 0) {
    return zeroTriplet(currency);
  }

  const paymentIds = paymentRows.map((row) => row.id);
  const applicationRows = await db
    .select({
      paymentId: paymentApplications.paymentId,
      appliedAmount: paymentApplications.appliedAmount,
      appliedCurrency: paymentApplications.currency,
      subtotalAmount: billingRecords.subtotalAmount,
      totalAmount: billingRecords.totalAmount,
      taxAmount: billingRecords.taxAmount,
      recordCurrency: billingRecords.currency,
    })
    .from(paymentApplications)
    .innerJoin(billingRecords, eq(billingRecords.id, paymentApplications.billingRecordId))
    .where(
      and(
        eq(paymentApplications.organizationId, organizationId),
        inArray(paymentApplications.paymentId, paymentIds),
      ),
    );

  let total = zeroTriplet(currency);

  for (const row of paymentRows) {
    const header = fromNumericString(row.amount, row.paymentCurrency);
    if (!header) continue;
    const basis = row.amountBasis ?? 'net';
    const apps = applicationRows.filter((app) => app.paymentId === row.id);
    let appliedHeader = 0;

    for (const app of apps) {
      if (app.recordCurrency.toUpperCase() !== currency.toUpperCase()) continue;
      const applied = fromNumericString(app.appliedAmount, app.appliedCurrency);
      if (!applied) continue;
      appliedHeader += Number(applied.amount);
      const invoice = {
        totalAmount: fromNumericString(app.totalAmount, app.recordCurrency)!,
        subtotalAmount: fromNumericString(app.subtotalAmount, app.recordCurrency)!,
        taxAmount: app.taxAmount
          ? fromNumericString(app.taxAmount, app.recordCurrency)
          : null,
      };
      const triplet = resolvePaymentTriplet(applied, basis, invoice);
      total = {
        net: { amount: (Number(total.net.amount) + Number(triplet.net.amount)).toFixed(6), currency },
        vat: { amount: (Number(total.vat.amount) + Number(triplet.vat.amount)).toFixed(6), currency },
        gross: {
          amount: (Number(total.gross.amount) + Number(triplet.gross.amount)).toFixed(6),
          currency,
        },
      };
    }

    const unallocated = Math.max(0, Number(header.amount) - appliedHeader);
    if (unallocated > 0) {
      const triplet = resolvePaymentTriplet(
        { amount: unallocated.toFixed(6), currency },
        basis,
        null,
      );
      total = {
        net: { amount: (Number(total.net.amount) + Number(triplet.net.amount)).toFixed(6), currency },
        vat: { amount: (Number(total.vat.amount) + Number(triplet.vat.amount)).toFixed(6), currency },
        gross: {
          amount: (Number(total.gross.amount) + Number(triplet.gross.amount)).toFixed(6),
          currency,
        },
      };
    }

    if (apps.length === 0) {
      const triplet = resolvePaymentTriplet(header, basis, null);
      total = {
        net: { amount: (Number(total.net.amount) + Number(triplet.net.amount)).toFixed(6), currency },
        vat: { amount: (Number(total.vat.amount) + Number(triplet.vat.amount)).toFixed(6), currency },
        gross: {
          amount: (Number(total.gross.amount) + Number(triplet.gross.amount)).toFixed(6),
          currency,
        },
      };
    }
  }

  return {
    net: { amount: Number(total.net.amount).toFixed(2), currency },
    vat: { amount: Number(total.vat.amount).toFixed(2), currency },
    gross: { amount: Number(total.gross.amount).toFixed(2), currency },
  };
}

/** @deprecated Use sumCollectionTripletsInDateRange().gross */
export async function sumCollectionsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const triplet = await sumCollectionTripletsInDateRange(
    db,
    organizationId,
    currency,
    fromDate,
    toDate,
  );
  return triplet.gross;
}

/** @deprecated Use sumCollectionTripletsInDateRange().net */
export async function sumNetCollectionsInDateRange(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<MoneyValue> {
  const triplet = await sumCollectionTripletsInDateRange(
    db,
    organizationId,
    currency,
    fromDate,
    toDate,
  );
  return triplet.net;
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
 *
 * Org scope: payment header cash (includes unallocated remainder and split
 * receipts with null billing_record_id).
 * Project scope: applied amounts attributed via payment_applications → invoice
 * project (plus legacy 1:1 payments without application rows).
 */
export async function loadCashFlowPayments(
  db: DbExecutor,
  organizationId: string,
  options: { readonly projectId?: string } = {},
): Promise<CashFlowPaymentRow[]> {
  if (options.projectId) {
    const applicationRows = await db
      .select({
        amount: paymentApplications.appliedAmount,
        currency: paymentApplications.currency,
        paymentDate: payments.paymentDate,
        status: payments.status,
        projectId: billingRecords.projectId,
      })
      .from(paymentApplications)
      .innerJoin(payments, eq(payments.id, paymentApplications.paymentId))
      .innerJoin(billingRecords, eq(billingRecords.id, paymentApplications.billingRecordId))
      .where(
        and(
          eq(paymentApplications.organizationId, organizationId),
          eq(payments.organizationId, organizationId),
          eq(billingRecords.organizationId, organizationId),
          eq(billingRecords.projectId, options.projectId),
          isNull(billingRecords.archivedAt),
        ),
      );

    const legacyRows = await db
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
          eq(payments.organizationId, organizationId),
          eq(billingRecords.organizationId, organizationId),
          eq(billingRecords.projectId, options.projectId),
          isNull(billingRecords.archivedAt),
          sql`not exists (
            select 1 from payment_applications pa
            where pa.payment_id = ${payments.id}
          )`,
        ),
      );

    return mapCashFlowPaymentRows([...applicationRows, ...legacyRows]);
  }

  const rows = await db
    .select({
      amount: payments.amount,
      currency: payments.currency,
      paymentDate: payments.paymentDate,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.organizationId, organizationId));

  return mapCashFlowPaymentRows(
    rows.map((row) => ({
      ...row,
      projectId: null,
    })),
  );
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
