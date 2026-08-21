import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { getCatalogEntryById } from '@/modules/business-catalog';
import type { VendorCatalogLinkRecord } from '../domain/types';
import {
  findVendorById,
  listVendorCatalogLinks,
  replaceVendorCatalogLinks,
} from '../data/vendors.repository';

const setLinksSchema = z.object({
  vendorId: z.string().uuid(),
  categoryIds: z.array(z.string().uuid()).default([]),
  specialtyIds: z.array(z.string().uuid()).default([]),
});

export async function listCatalogLinksForVendor(
  context: OrgContext,
  vendorId: string,
): Promise<VendorCatalogLinkRecord[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const vendor = await findVendorById(context.db, context.organizationId, vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  return listVendorCatalogLinks(context.db, context.organizationId, vendorId);
}

export async function setVendorCatalogLinks(
  context: OrgContext,
  rawInput: unknown,
): Promise<VendorCatalogLinkRecord[]> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = setLinksSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const vendor = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const allIds = [...parsed.data.categoryIds, ...parsed.data.specialtyIds];
  for (const entryId of allIds) {
    const entry = await getCatalogEntryById(context.db, context.organizationId, entryId);
    if (!entry) {
      throw new ValidationError([{ path: 'catalogEntryId', message: 'Catalog entry not found' }]);
    }
    if (parsed.data.categoryIds.includes(entryId) && entry.kind !== 'vendor_category') {
      throw new ValidationError([{ path: 'categoryIds', message: 'Entry is not a vendor category' }]);
    }
    if (parsed.data.specialtyIds.includes(entryId) && entry.kind !== 'vendor_specialty') {
      throw new ValidationError([
        { path: 'specialtyIds', message: 'Entry is not a vendor specialty' },
      ]);
    }
  }

  const links = await replaceVendorCatalogLinks(context.db, {
    organizationId: context.organizationId,
    vendorId: parsed.data.vendorId,
    categoryIds: parsed.data.categoryIds,
    specialtyIds: parsed.data.specialtyIds,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_UPDATED,
    entityType: 'vendor',
    entityId: vendor.id,
    after: {
      catalogLinks: true,
      categoryIds: parsed.data.categoryIds,
      specialtyIds: parsed.data.specialtyIds,
    },
  });

  return links;
}
