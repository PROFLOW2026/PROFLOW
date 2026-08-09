import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { VendorDetail, VendorListFilters, VendorListItem } from '../domain/types';
import { getVendorDetail, listVendors } from '../data/vendors.repository';
import { listVendorsSchema } from '../validation/schemas';

export async function listVendorsForOrg(
  context: OrgContext,
  rawFilters: VendorListFilters = {},
): Promise<VendorListItem[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const parsed = listVendorsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listVendors(context.db, context.organizationId, parsed.data);
}

export async function getVendorById(context: OrgContext, vendorId: string): Promise<VendorDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const detail = await getVendorDetail(context.db, context.organizationId, vendorId);
  if (!detail) throw new NotFoundError('Vendor');

  return detail;
}
