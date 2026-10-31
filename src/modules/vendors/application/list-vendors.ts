import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { VendorDetail, VendorListFilters, VendorListItem } from '../domain/types';
import {
  countVendors,
  getVendorDetail,
  listEngagementsForVendorIds,
  listVendors,
} from '../data/vendors.repository';
import { resolveVendorAggregateScope } from '../domain/resolve-vendor-aggregate-ids';
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

  const filters = {
    ...parsed.data,
    includeLinkedChildRecords: parsed.data.includeLinkedChildRecords ?? false,
  };
  return listVendors(context.db, context.organizationId, filters);
}

export async function countVendorsForOrg(
  context: OrgContext,
  rawFilters: VendorListFilters = {},
): Promise<number> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const parsed = listVendorsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const filters = {
    ...parsed.data,
    includeLinkedChildRecords: parsed.data.includeLinkedChildRecords ?? false,
  };
  return countVendors(context.db, context.organizationId, filters);
}

export async function getVendorById(context: OrgContext, vendorId: string): Promise<VendorDetail> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const scope = await resolveVendorAggregateScope(context, vendorId);
  const detail = await getVendorDetail(context.db, context.organizationId, scope.canonicalVendorId);
  if (!detail) throw new NotFoundError('Vendor');

  if (scope.expenseVendorIds.length <= 1) {
    return detail;
  }

  const engagements = await listEngagementsForVendorIds(
    context.db,
    context.organizationId,
    scope.expenseVendorIds,
    { status: 'active' },
  );
  const activeProjectIds = engagements
    .filter((engagement) => engagement.status === 'active')
    .map((engagement) => engagement.projectId);

  return {
    ...detail,
    engagements,
    projectCount: new Set(activeProjectIds).size,
  };
}
