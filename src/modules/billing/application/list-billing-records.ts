import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listBillingRecords as listBillingRecordsRepo } from '../data/billing.repository';
import type { BillingListFilters, BillingRecordSummary } from '../domain/types';
import { listBillingRecordsSchema } from '../validation/schemas';

export async function listBillingRecords(
  context: OrgContext,
  rawFilters: BillingListFilters = {},
): Promise<BillingRecordSummary[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const parsed = listBillingRecordsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listBillingRecordsRepo(
    context.db,
    context.organizationId,
    parsed.data,
    context.organization.timezone,
  );
}
