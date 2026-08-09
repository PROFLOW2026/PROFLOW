import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { listPaymentApplications as listPaymentApplicationsRepo } from '../data/payments.repository';
import type { PaymentApplicationFilters, PaymentApplicationRow } from '../domain/types';
import { listPaymentApplicationsSchema } from '../validation/schemas';

export async function listPaymentApplications(
  context: OrgContext,
  rawFilters: PaymentApplicationFilters = {},
): Promise<PaymentApplicationRow[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const parsed = listPaymentApplicationsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listPaymentApplicationsRepo(context.db, context.organizationId, parsed.data);
}
