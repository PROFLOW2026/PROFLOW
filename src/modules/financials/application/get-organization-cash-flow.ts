import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { isPositiveMoney, isZeroMoney, money } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import {
  computeBillOutstanding,
  getVendorPaymentsRepository,
  isRecognizedVendorBillStatus,
  listActiveCreditAmountsForBills,
  listApBills,
} from '@/modules/ap';
import { loadCashFlowPayments } from '../data/billing.repository';
import {
  buildCashFlowOutlook,
  type ApBillCashInput,
  type CashFlowOutlook,
} from '../domain/cash-flow';

function mapApBillsForCash(
  rows: Awaited<ReturnType<typeof listApBills>>,
  appliedByBillId: ReadonlyMap<string, string[]>,
  creditsByBillId: ReadonlyMap<string, string[]>,
  currency: string,
): ApBillCashInput[] {
  const mapped: ApBillCashInput[] = [];
  for (const row of rows) {
    if (!isRecognizedVendorBillStatus(row.status)) continue;
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (appliedByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
      creditApplications: (creditsByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        status: 'applied' as const,
      })),
      retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
    });
    if (!isPositiveMoney(outstanding)) continue;
    mapped.push({
      status: row.status,
      dueDate: (row.dueDate as BusinessDate | null) ?? null,
      totalAmount: outstanding,
    });
  }
  return mapped;
}

export async function getOrganizationCashFlowOutlook(
  context: OrgContext,
  options: {
    /**
     * Optional preloaded org billing summaries (same shape as listBillingRecords).
     * Used by reports analytics to avoid a second identical org-wide load.
     */
    readonly billingRecords?: Awaited<ReturnType<typeof listBillingRecords>> | null;
  } = {},
): Promise<CashFlowOutlook | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = context.organization.baseCurrency;

  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);

  const [records, paymentRows, apBundle] = await Promise.all([
    options.billingRecords
      ? Promise.resolve(options.billingRecords)
      : listBillingRecords(context, { filter: 'all', limit: ORG_LIST_EXPORT_CAP }),
    loadCashFlowPayments(context.db, context.organizationId),
    canReadAp
      ? listApBills(context.db, context.organizationId, {
          limit: ORG_LIST_EXPORT_CAP,
        }).then(async (apRows) => {
          const billIds = apRows.map((row) => row.id);
          const [appliedByBillId, creditsByBillId] = await Promise.all([
            getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
              context.db,
              context.organizationId,
              billIds,
            ),
            listActiveCreditAmountsForBills(context.db, context.organizationId, billIds),
          ]);
          return { apRows, appliedByBillId, creditsByBillId };
        })
      : Promise.resolve(null),
  ]);

  const outstandingRecords = records.filter(
    (record) =>
      record.totalAmount.currency === currency && !isZeroMoney(record.outstandingAmount),
  );

  const payments = paymentRows.filter((row) => row.amount.currency === currency);

  const openApBills = apBundle
    ? mapApBillsForCash(
        apBundle.apRows,
        apBundle.appliedByBillId,
        apBundle.creditsByBillId,
        currency,
      )
    : undefined;

  return buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords,
    payments,
    openApBills,
  });
}
