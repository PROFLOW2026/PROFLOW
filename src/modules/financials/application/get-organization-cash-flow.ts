import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { isPositiveMoney } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords } from '@/modules/billing';
import { computeIncomingCashOutlook, type CashFlowOutlook } from '../domain/cash-flow';

export async function getOrganizationCashFlowOutlook(
  context: OrgContext,
): Promise<CashFlowOutlook | null> {
  assertPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!hasPermission(context, PERMISSIONS.BILLING_READ)) return null;

  const asOf = todayInTimeZone(context.organization.timezone);
  const records = await listBillingRecords(context, { filter: 'all', limit: 5_000 });
  const open = records.filter((record) => isPositiveMoney(record.outstandingAmount));

  return computeIncomingCashOutlook(open, context.organization.baseCurrency, asOf);
}
