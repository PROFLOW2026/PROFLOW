import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { isPositiveMoney } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { computeReceivablesAging, type ReceivablesAging } from '../domain/aging';
import { listBillingRecords } from './list-billing-records';

export async function getOrganizationReceivablesAging(
  context: OrgContext,
): Promise<ReceivablesAging> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const asOf = todayInTimeZone(context.organization.timezone);
  const records = await listBillingRecords(context, { filter: 'all', limit: 5_000 });
  const open = records.filter((record) => isPositiveMoney(record.outstandingAmount));

  return computeReceivablesAging(open, context.organization.baseCurrency, asOf);
}
