import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { VendorRecord } from '../domain/types';
import { findVendorById, updateVendorById } from '../data/vendors.repository';
import { archiveVendorSchema } from '../validation/schemas';

export async function archiveVendor(
  context: OrgContext,
  rawInput: { vendorId: string },
): Promise<VendorRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = archiveVendorSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!existing) throw new NotFoundError('Vendor');
  assertSameOrganization(context, existing, 'Vendor');

  const updated = await updateVendorById(context.db, context.organizationId, parsed.data.vendorId, {
    status: 'inactive',
    archivedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Vendor');

  await recordAuditEvent(context, {
    action: 'vendor.archived',
    entityType: 'vendor',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
