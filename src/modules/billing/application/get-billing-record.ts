import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findBillingRecordById } from '../data/billing.repository';
import type { BillingRecordDetail } from '../domain/types';

export async function getBillingRecord(
  context: OrgContext,
  billingRecordId: string,
): Promise<BillingRecordDetail> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const record = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!record) throw new NotFoundError('Billing record');
  return record;
}
