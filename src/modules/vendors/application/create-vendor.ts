import { recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import { resolveDocumentPaymentTermId } from '@/modules/business-catalog';
import { resolveOrgDefaultPaymentTermIdForContext } from '@/modules/business-catalog/application/payment-term-defaults';
import type { VendorRecord } from '../domain/types';import { findVendorById, insertVendor } from '../data/vendors.repository';
import { createVendorSchema, type CreateVendorInput } from '../validation/schemas';
import { setVendorCatalogLinks } from './manage-catalog-links';

export type CreateVendorResult = VendorRecord;

/**
 * Creates a vendor with only a name required (doc 39 §4).
 * Notes module usage so Vendors appears in navigation on first create.
 */
export async function createVendor(
  context: OrgContext,
  rawInput: CreateVendorInput,
): Promise<CreateVendorResult> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = createVendorSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  const orgDefaultId = await resolveOrgDefaultPaymentTermIdForContext(context);
  const defaultPaymentTermId = resolveDocumentPaymentTermId({
    explicitId: input.defaultPaymentTermId,
    partyDefaultId: null,
    orgDefaultId,
  });

  if (input.parentVendorId) {
    const parent = await findVendorById(context.db, context.organizationId, input.parentVendorId);
    if (!parent) {
      throw new ValidationError([{ path: 'parentVendorId', message: 'Parent vendor not found' }]);
    }
  }

  const vendor = await insertVendor(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    type: input.type,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    addressLine1: input.addressLine1 ?? null,
    city: input.city ?? null,
    countryCode: input.countryCode ?? null,
    tier: input.tier ?? null,
    parentVendorId: input.parentVendorId ?? null,
    notes: input.notes ?? null,
    defaultPaymentTermId,
  });

  if (input.categoryIds?.length || input.specialtyIds?.length) {
    await setVendorCatalogLinks(context, {
      vendorId: vendor.id,
      categoryIds: input.categoryIds ?? [],
      specialtyIds: input.specialtyIds ?? [],
    });
  }

  await noteModuleUsage(context.db, context.organizationId, 'vendors');

  await recordAuditEvent(context, {
    action: 'vendor.created',
    entityType: 'vendor',
    entityId: vendor.id,
    after: vendor,
  });

  return vendor;
}
