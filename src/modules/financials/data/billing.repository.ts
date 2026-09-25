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
import { addDays, businessDate, type BusinessDate } from '@/shared/dates';
import { fromNumericString, isZeroMoney, money, type MoneyValue } from '@/shared/money';
import type { DbExecutor } from '@/shared/db/types';
import { CASH_FLOW_HORIZON_DAYS } from '../domain/cash-flow';
import { sqlFirstRow, sqlRows } from './sql-rows';

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
  options: { readonly projectIds?: readonly string[] } = {},
): Promise<ProjectBillingRows> {
  const { projectIds } = options;
  if (projectIds && projectIds.length === 0) {
    return { records: [], currency: '' };
  }

  const records = await db
    .select()
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        isNull(billingRecords.archivedAt),
        projectIds && projectIds.length > 0
          ? inArray(billingRecords.projectId, [...projectIds])
          : undefined,
      ),
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

export interface ReportBucketTotal {
  readonly total: string;
  readonly count: number;
}

/**
 * Outstanding sums for org reports. Same open-net rules as
 * `computeRecordRevenuePosition` (draft/void out, credit notes negate
 * subtotal, gross payments convert with net/gross rounded half-up to 6dp,
 * retention held is net except on credit notes, overpay stays negative).
 * Aging and cash buckets match `computeReceivablesAging` and
 * `computeIncomingCashOutlook`. Foreign currency is excluded.
 */
export interface OrganizationBillingReportAggregates {
  readonly aging: {
    readonly current: ReportBucketTotal;
    readonly days_1_30: ReportBucketTotal;
    readonly days_31_60: ReportBucketTotal;
    readonly days_61_90: ReportBucketTotal;
    readonly days_90_plus: ReportBucketTotal;
  };
  readonly incoming: {
    readonly overdue: ReportBucketTotal;
    readonly next_7: ReportBucketTotal;
    readonly next_30: ReportBucketTotal;
    readonly next_60: ReportBucketTotal;
    readonly next_90: ReportBucketTotal;
    readonly later: ReportBucketTotal;
    readonly undated: ReportBucketTotal;
  };
}

type BillingReportAggregateRow = {
  aging_current_total: string | number | null;
  aging_current_count: string | number | null;
  aging_days_1_30_total: string | number | null;
  aging_days_1_30_count: string | number | null;
  aging_days_31_60_total: string | number | null;
  aging_days_31_60_count: string | number | null;
  aging_days_61_90_total: string | number | null;
  aging_days_61_90_count: string | number | null;
  aging_days_90_plus_total: string | number | null;
  aging_days_90_plus_count: string | number | null;
  cash_overdue_total: string | number | null;
  cash_overdue_count: string | number | null;
  cash_next_7_total: string | number | null;
  cash_next_7_count: string | number | null;
  cash_next_30_total: string | number | null;
  cash_next_30_count: string | number | null;
  cash_next_60_total: string | number | null;
  cash_next_60_count: string | number | null;
  cash_next_90_total: string | number | null;
  cash_next_90_count: string | number | null;
  cash_later_total: string | number | null;
  cash_later_count: string | number | null;
  cash_undated_total: string | number | null;
  cash_undated_count: string | number | null;
};

function reportBucket(
  total: string | number | null | undefined,
  count: string | number | null | undefined,
): ReportBucketTotal {
  const parsedCount = typeof count === 'number' ? count : Number(count ?? 0);
  return {
    total: total == null || total === '' ? '0' : String(total),
    count: Number.isFinite(parsedCount) ? parsedCount : 0,
  };
}

function zeroReportBucket(): ReportBucketTotal {
  return { total: '0', count: 0 };
}

export function emptyOrganizationBillingReportAggregates(): OrganizationBillingReportAggregates {
  return {
    aging: {
      current: zeroReportBucket(),
      days_1_30: zeroReportBucket(),
      days_31_60: zeroReportBucket(),
      days_61_90: zeroReportBucket(),
      days_90_plus: zeroReportBucket(),
    },
    incoming: {
      overdue: zeroReportBucket(),
      next_7: zeroReportBucket(),
      next_30: zeroReportBucket(),
      next_60: zeroReportBucket(),
      next_90: zeroReportBucket(),
      later: zeroReportBucket(),
      undated: zeroReportBucket(),
    },
  };
}

export function mapOrganizationBillingReportAggregateRow(
  row: BillingReportAggregateRow | undefined,
): OrganizationBillingReportAggregates {
  if (!row) return emptyOrganizationBillingReportAggregates();
  return {
    aging: {
      current: reportBucket(row.aging_current_total, row.aging_current_count),
      days_1_30: reportBucket(row.aging_days_1_30_total, row.aging_days_1_30_count),
      days_31_60: reportBucket(row.aging_days_31_60_total, row.aging_days_31_60_count),
      days_61_90: reportBucket(row.aging_days_61_90_total, row.aging_days_61_90_count),
      days_90_plus: reportBucket(row.aging_days_90_plus_total, row.aging_days_90_plus_count),
    },
    incoming: {
      overdue: reportBucket(row.cash_overdue_total, row.cash_overdue_count),
      next_7: reportBucket(row.cash_next_7_total, row.cash_next_7_count),
      next_30: reportBucket(row.cash_next_30_total, row.cash_next_30_count),
      next_60: reportBucket(row.cash_next_60_total, row.cash_next_60_count),
      next_90: reportBucket(row.cash_next_90_total, row.cash_next_90_count),
      later: reportBucket(row.cash_later_total, row.cash_later_count),
      undated: reportBucket(row.cash_undated_total, row.cash_undated_count),
    },
  };
}

/**
 * Org-report AR aging and incoming cash buckets as SQL sums.
 * Does not load billing rows into the application.
 * Open-net arithmetic matches `reportBillingOpenNet`.
 */
export async function aggregateOrganizationBillingReportBuckets(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  asOf: BusinessDate,
  options: { readonly fromDate?: string | null; readonly toDate?: string | null } = {},
): Promise<OrganizationBillingReportAggregates> {
  const normalized = currency.toUpperCase();
  const next7 = addDays(asOf, 7);
  const next30 = addDays(asOf, 30);
  const next60 = addDays(asOf, 60);
  const next90 = addDays(asOf, CASH_FLOW_HORIZON_DAYS);
  const fromFilter = options.fromDate
    ? sql`AND br.issue_date >= ${options.fromDate}`
    : sql``;
  const toFilter = options.toDate ? sql`AND br.issue_date <= ${options.toDate}` : sql``;

  const row = sqlFirstRow<BillingReportAggregateRow>(
    await db.execute(sql`
      WITH billed AS (
        SELECT
          br.id,
          br.due_date,
          CASE
            WHEN br.kind::text = 'credit_note' THEN -br.subtotal_amount
            ELSE br.subtotal_amount
          END AS billed_net,
          CASE
            WHEN br.kind::text = 'credit_note' THEN 0
            ELSE br.retention_held_remaining
          END AS retention_net,
          CASE
            WHEN (
              CASE
                WHEN br.tax_amount IS NOT NULL AND br.tax_amount <> 0
                  THEN br.subtotal_amount + br.tax_amount
                ELSE br.total_amount
              END
            ) = 0 THEN 1
            ELSE br.subtotal_amount / (
              CASE
                WHEN br.tax_amount IS NOT NULL AND br.tax_amount <> 0
                  THEN br.subtotal_amount + br.tax_amount
                ELSE br.total_amount
              END
            )
          END AS net_to_gross
        FROM billing_records br
        WHERE br.organization_id = ${organizationId}
          AND br.archived_at IS NULL
          AND br.status::text NOT IN ('draft', 'void')
          AND upper(br.currency) = ${normalized}
          ${fromFilter}
          ${toFilter}
      ),
      paid AS (
        SELECT billing_record_id, SUM(contrib) AS paid_net
        FROM (
          SELECT
            pa.billing_record_id,
            CASE
              WHEN COALESCE(p.amount_basis::text, 'net') = 'gross'
                THEN ROUND(pa.applied_amount * b.net_to_gross, 6)
              ELSE pa.applied_amount
            END AS contrib
          FROM payment_applications pa
          INNER JOIN payments p
            ON p.id = pa.payment_id
           AND p.organization_id = pa.organization_id
          INNER JOIN billed b ON b.id = pa.billing_record_id
          WHERE pa.organization_id = ${organizationId}
            AND p.status::text = 'recorded'
            AND upper(pa.currency) = ${normalized}
          UNION ALL
          SELECT
            p.billing_record_id,
            CASE
              WHEN COALESCE(p.amount_basis::text, 'net') = 'gross'
                THEN ROUND(p.amount * b.net_to_gross, 6)
              ELSE p.amount
            END AS contrib
          FROM payments p
          INNER JOIN billed b ON b.id = p.billing_record_id
          WHERE p.organization_id = ${organizationId}
            AND p.status::text = 'recorded'
            AND p.billing_record_id IS NOT NULL
            AND upper(p.currency) = ${normalized}
            AND NOT EXISTS (
              SELECT 1 FROM payment_applications pa WHERE pa.payment_id = p.id
            )
        ) lines
        GROUP BY billing_record_id
      ),
      open_rows AS (
        SELECT
          b.due_date,
          CASE
            WHEN COALESCE(p.paid_net, 0) >= b.billed_net
             AND (b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net) >= 0
              THEN 0
            ELSE ROUND(b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net, 6)
          END AS open_net
        FROM billed b
        LEFT JOIN paid p ON p.billing_record_id = b.id
      ),
      bucketed AS (
        SELECT
          open_net,
          CASE
            WHEN open_net < 0 THEN 'current'
            WHEN due_date IS NULL OR due_date >= ${asOf}::date THEN 'current'
            WHEN (${asOf}::date - due_date) <= 30 THEN 'days_1_30'
            WHEN (${asOf}::date - due_date) <= 60 THEN 'days_31_60'
            WHEN (${asOf}::date - due_date) <= 90 THEN 'days_61_90'
            ELSE 'days_90_plus'
          END AS aging_bucket,
          CASE
            WHEN open_net < 0 OR due_date IS NULL THEN 'undated'
            WHEN due_date < ${asOf}::date THEN 'overdue'
            WHEN due_date <= ${next7}::date THEN 'next_7'
            WHEN due_date <= ${next30}::date THEN 'next_30'
            WHEN due_date <= ${next60}::date THEN 'next_60'
            WHEN due_date <= ${next90}::date THEN 'next_90'
            ELSE 'later'
          END AS cash_bucket
        FROM open_rows
        WHERE open_net <> 0
      )
      SELECT
        COALESCE(SUM(open_net) FILTER (WHERE aging_bucket = 'current'), 0)::text AS aging_current_total,
        COALESCE(COUNT(*) FILTER (WHERE aging_bucket = 'current'), 0)::int AS aging_current_count,
        COALESCE(SUM(open_net) FILTER (WHERE aging_bucket = 'days_1_30'), 0)::text AS aging_days_1_30_total,
        COALESCE(COUNT(*) FILTER (WHERE aging_bucket = 'days_1_30'), 0)::int AS aging_days_1_30_count,
        COALESCE(SUM(open_net) FILTER (WHERE aging_bucket = 'days_31_60'), 0)::text AS aging_days_31_60_total,
        COALESCE(COUNT(*) FILTER (WHERE aging_bucket = 'days_31_60'), 0)::int AS aging_days_31_60_count,
        COALESCE(SUM(open_net) FILTER (WHERE aging_bucket = 'days_61_90'), 0)::text AS aging_days_61_90_total,
        COALESCE(COUNT(*) FILTER (WHERE aging_bucket = 'days_61_90'), 0)::int AS aging_days_61_90_count,
        COALESCE(SUM(open_net) FILTER (WHERE aging_bucket = 'days_90_plus'), 0)::text AS aging_days_90_plus_total,
        COALESCE(COUNT(*) FILTER (WHERE aging_bucket = 'days_90_plus'), 0)::int AS aging_days_90_plus_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'overdue'), 0)::text AS cash_overdue_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'overdue'), 0)::int AS cash_overdue_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'next_7'), 0)::text AS cash_next_7_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'next_7'), 0)::int AS cash_next_7_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'next_30'), 0)::text AS cash_next_30_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'next_30'), 0)::int AS cash_next_30_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'next_60'), 0)::text AS cash_next_60_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'next_60'), 0)::int AS cash_next_60_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'next_90'), 0)::text AS cash_next_90_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'next_90'), 0)::int AS cash_next_90_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'later'), 0)::text AS cash_later_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'later'), 0)::int AS cash_later_count,
        COALESCE(SUM(open_net) FILTER (WHERE cash_bucket = 'undated'), 0)::text AS cash_undated_total,
        COALESCE(COUNT(*) FILTER (WHERE cash_bucket = 'undated'), 0)::int AS cash_undated_count
      FROM bucketed
    `),
  );

  return mapOrganizationBillingReportAggregateRow(row);
}

export interface CashFlowOpenBillingRow {
  readonly id: string;
  readonly reference: string | null;
  readonly projectId: string | null;
  readonly dueDate: BusinessDate | null;
  readonly kind: string;
  readonly outstandingNet: MoneyValue;
}

/**
 * Open billing for the cash forecast. Same open-net formula as
 * `aggregateOrganizationBillingReportBuckets`. Returns only non-zero open rows,
 * with no 5,000-row list cap.
 */
export async function loadCashFlowOpenBillingRows(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<CashFlowOpenBillingRow[]> {
  const normalized = currency.toUpperCase();
  const rows = sqlRows<{
    id: string;
    reference: string | null;
    project_id: string | null;
    due_date: string | null;
    kind: string;
    open_net: string;
  }>(
    await db.execute(sql`
      WITH billed AS (
        SELECT
          br.id,
          br.reference,
          br.project_id,
          br.due_date,
          br.kind::text AS kind,
          CASE
            WHEN br.kind::text = 'credit_note' THEN -br.subtotal_amount
            ELSE br.subtotal_amount
          END AS billed_net,
          CASE
            WHEN br.kind::text = 'credit_note' THEN 0
            ELSE br.retention_held_remaining
          END AS retention_net,
          CASE
            WHEN (
              CASE
                WHEN br.tax_amount IS NOT NULL AND br.tax_amount <> 0
                  THEN br.subtotal_amount + br.tax_amount
                ELSE br.total_amount
              END
            ) = 0 THEN 1
            ELSE br.subtotal_amount / (
              CASE
                WHEN br.tax_amount IS NOT NULL AND br.tax_amount <> 0
                  THEN br.subtotal_amount + br.tax_amount
                ELSE br.total_amount
              END
            )
          END AS net_to_gross
        FROM billing_records br
        WHERE br.organization_id = ${organizationId}
          AND br.archived_at IS NULL
          AND br.status::text NOT IN ('draft', 'void')
          AND upper(br.currency) = ${normalized}
      ),
      paid AS (
        SELECT billing_record_id, SUM(contrib) AS paid_net
        FROM (
          SELECT
            pa.billing_record_id,
            CASE
              WHEN COALESCE(p.amount_basis::text, 'net') = 'gross'
                THEN ROUND(pa.applied_amount * b.net_to_gross, 6)
              ELSE pa.applied_amount
            END AS contrib
          FROM payment_applications pa
          INNER JOIN payments p
            ON p.id = pa.payment_id
           AND p.organization_id = pa.organization_id
          INNER JOIN billed b ON b.id = pa.billing_record_id
          WHERE pa.organization_id = ${organizationId}
            AND p.status::text = 'recorded'
            AND upper(pa.currency) = ${normalized}
          UNION ALL
          SELECT
            p.billing_record_id,
            CASE
              WHEN COALESCE(p.amount_basis::text, 'net') = 'gross'
                THEN ROUND(p.amount * b.net_to_gross, 6)
              ELSE p.amount
            END AS contrib
          FROM payments p
          INNER JOIN billed b ON b.id = p.billing_record_id
          WHERE p.organization_id = ${organizationId}
            AND p.status::text = 'recorded'
            AND p.billing_record_id IS NOT NULL
            AND upper(p.currency) = ${normalized}
            AND NOT EXISTS (
              SELECT 1 FROM payment_applications pa WHERE pa.payment_id = p.id
            )
        ) lines
        GROUP BY billing_record_id
      )
      SELECT
        b.id,
        b.reference,
        b.project_id,
        b.due_date,
        b.kind,
        CASE
          WHEN COALESCE(p.paid_net, 0) >= b.billed_net
           AND (b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net) >= 0
            THEN 0
          ELSE ROUND(b.billed_net - COALESCE(p.paid_net, 0) - b.retention_net, 6)
        END AS open_net
      FROM billed b
      LEFT JOIN paid p ON p.billing_record_id = b.id
    `),
  );

  const open: CashFlowOpenBillingRow[] = [];
  for (const row of rows) {
    const outstandingNet = fromNumericString(row.open_net, normalized) ?? money('0', normalized);
    if (isZeroMoney(outstandingNet)) continue;
    open.push({
      id: row.id,
      reference: row.reference,
      projectId: row.project_id,
      dueDate: row.due_date ? businessDate(row.due_date) : null,
      kind: row.kind,
      outstandingNet,
    });
  }
  return open;
}
