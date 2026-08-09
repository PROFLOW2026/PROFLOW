import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { isZeroMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import { loadCashFlowPayments } from '../data/billing.repository';
import { buildCashFlowOutlook, type CashFlowOutlook } from '../domain/cash-flow';

export async function getOrganizationCashFlowOutlook(
  context: OrgContext,
): Promise<CashFlowOutlook | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;

  const asOf = todayInTimeZone(context.organization.timezone);
  const currency = context.organization.baseCurrency;

  const [records, paymentRows] = await Promise.all([
    listBillingRecords(context, { filter: 'all', limit: 5_000 }),
    loadCashFlowPayments(context.db, context.organizationId),
  ]);

  const outstandingRecords = records.filter(
    (record) =>
      record.totalAmount.currency === currency && !isZeroMoney(record.outstandingAmount),
  );

  const payments = paymentRows.filter((row) => row.amount.currency === currency);

  return buildCashFlowOutlook({
    currency,
    asOf,
    outstandingRecords,
    payments,
  });
}
