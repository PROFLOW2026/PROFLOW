import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { VendorRecord } from '../domain/types';
import { findVendorById, updateVendorById } from '../data/vendors.repository';
import { updateVendorSchema, type UpdateVendorInput } from '../validation/schemas';

export async function updateVendor(
  context: OrgContext,
  rawInput: UpdateVendorInput,
): Promise<VendorRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = updateVendorSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!existing) throw new NotFoundError('Vendor');
  assertSameOrganization(context, existing, 'Vendor');

  if (parsed.data.parentVendorId) {
    if (parsed.data.parentVendorId === parsed.data.vendorId) {
      throw new ValidationError([{ path: 'parentVendorId', message: 'A vendor cannot be its own parent' }]);
    }
    const parent = await findVendorById(context.db, context.organizationId, parsed.data.parentVendorId);
    if (!parent) {
      throw new ValidationError([{ path: 'parentVendorId', message: 'Parent vendor not found' }]);
    }
  }

  const updated = await updateVendorById(context.db, context.organizationId, parsed.data.vendorId, {
    name: parsed.data.name,
    type: parsed.data.type,
    status: parsed.data.status,
    email: parsed.data.email,
    phone: parsed.data.phone,
    website: parsed.data.website,
    addressLine1: parsed.data.addressLine1,
    city: parsed.data.city,
    countryCode: parsed.data.countryCode,
    tier: parsed.data.tier,
    parentVendorId: parsed.data.parentVendorId,
    notes: parsed.data.notes,
  });

  if (!updated) throw new NotFoundError('Vendor');

  await recordAuditEvent(context, {
    action: 'vendor.updated',
    entityType: 'vendor',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
