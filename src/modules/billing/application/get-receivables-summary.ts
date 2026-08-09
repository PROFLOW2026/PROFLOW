import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeReceivablesSummary,
  type ReceivablesSummary,
} from '../domain/receivables-summary';
import { listBillingRecords } from './list-billing-records';

export async function getOrganizationReceivablesSummary(
  context: OrgContext,
): Promise<ReceivablesSummary> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const asOf = todayInTimeZone(context.organization.timezone);
  const records = await listBillingRecords(context, { filter: 'all', limit: 5_000 });

  return computeReceivablesSummary(records, context.organization.baseCurrency, asOf);
}
