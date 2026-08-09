import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { ORG_LIST_EXPORT_CAP } from '@/shared/db/list-limits';
import { isZeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import { listApBills, listAcceptedMatchAmountsForBills } from '@/modules/ap';
import { remainingUnmatchedAmount } from '@/modules/ap/domain/matching';
import { loadCashFlowPayments } from '../data/billing.repository';
import {
  buildCashFlowOutlook,
  type ApBillCashInput,
  type CashFlowOutlook,
} from '../domain/cash-flow';

function mapApBillsForCash(
  rows: Awaited<ReturnType<typeof listApBills>>,
  acceptedByBillId: ReadonlyMap<string, string[]>,
  currency: string,
): ApBillCashInput[] {
  const mapped: ApBillCashInput[] = [];
  for (const row of rows) {
    if (row.currency.toUpperCase() !== currency.toUpperCase()) continue;
    const unmatched = remainingUnmatchedAmount({
      currency: row.currency,
      billTotal: row.totalAmount,
      reservedMatchedAmounts: acceptedByBillId.get(row.id) ?? [],
    });
    mapped.push({
      status: row.status,
      dueDate: (row.dueDate as BusinessDate | null) ?? null,
      totalAmount: unmatched,
    });
  }
  return mapped;
}

export async function getOrganizationCashFlowOutlook(
  context: OrgContext,
): Promise<CashFlowOutlook | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = context.organization.baseCurrency;

  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);

  const [records, paymentRows, apBundle] = await Promise.all([
    listBillingRecords(context, { filter: 'all', limit: ORG_LIST_EXPORT_CAP }),
    loadCashFlowPayments(context.db, context.organizationId),
    canReadAp
      ? listApBills(context.db, context.organizationId, {
          limit: ORG_LIST_EXPORT_CAP,
        }).then(async (apRows) => {
          const acceptedByBillId = await listAcceptedMatchAmountsForBills(
            context.db,
            context.organizationId,
            apRows.map((row) => row.id),
          );
          return { apRows, acceptedByBillId };
        })
      : Promise.resolve(null),
  ]);

  const outstandingRecords = records.filter(
    (record) =>
      record.totalAmount.currency === currency && !isZeroMoney(record.outstandingAmount),
  );

  const payments = paymentRows.filter((row) => row.amount.currency === currency);

  const openApBills = apBundle
    ? mapApBillsForCash(apBundle.apRows, apBundle.acceptedByBillId, currency)
    : undefined;

  return buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords,
    payments,
    openApBills,
  });
}
