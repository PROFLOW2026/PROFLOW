import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { VendorIdentifierRecord } from '../domain/types';
import {
  deleteVendorIdentifier,
  findVendorById,
  findVendorIdentifierById,
  upsertVendorIdentifier,
} from '../data/vendors.repository';
import {
  deleteVendorIdentifierSchema,
  upsertVendorIdentifierSchema,
} from '../validation/schemas';

export async function upsertVendorPartyIdentifier(
  context: OrgContext,
  rawInput: {
    vendorId: string;
    type: VendorIdentifierRecord['type'];
    value: string;
  },
): Promise<VendorIdentifierRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = upsertVendorIdentifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const vendor = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const identifier = await upsertVendorIdentifier(context.db, {
    organizationId: context.organizationId,
    vendorId: parsed.data.vendorId,
    type: parsed.data.type,
    value: parsed.data.value,
  });

  await recordAuditEvent(context, {
    action: 'party_identifier.upserted',
    entityType: 'party_identifier',
    entityId: identifier.id,
    after: identifier,
  });

  return identifier;
}

export async function removeVendorPartyIdentifier(
  context: OrgContext,
  rawInput: { identifierId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = deleteVendorIdentifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorIdentifierById(
    context.db,
    context.organizationId,
    parsed.data.identifierId,
  );
  if (!existing) throw new NotFoundError('Identifier');

  await deleteVendorIdentifier(context.db, context.organizationId, parsed.data.identifierId);

  await recordAuditEvent(context, {
    action: 'party_identifier.deleted',
    entityType: 'party_identifier',
    entityId: existing.id,
    before: existing,
  });
}
