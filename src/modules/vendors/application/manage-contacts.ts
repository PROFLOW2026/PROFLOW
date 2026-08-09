import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { VendorContactRecord, VendorEngagementRecord } from '../domain/types';
import {
  archiveVendorEngagementById,
  deleteVendorContact,
  findProjectById,
  findVendorById,
  findVendorContactById,
  findVendorEngagementById,
  insertVendorContact,
  insertVendorEngagement,
  updateVendorContactById,
} from '../data/vendors.repository';
import {
  archiveEngagementSchema,
  createContactSchema,
  createEngagementSchema,
  deleteContactSchema,
  updateContactSchema,
} from '../validation/schemas';

export async function createVendorContact(
  context: OrgContext,
  rawInput: {
    vendorId: string;
    name: string;
    role?: VendorContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<VendorContactRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = createContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const vendor = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const contact = await insertVendorContact(context.db, {
    organizationId: context.organizationId,
    vendorId: parsed.data.vendorId,
    name: parsed.data.name,
    role: parsed.data.role,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: 'vendor_contact.created',
    entityType: 'vendor_contact',
    entityId: contact.id,
    after: contact,
  });

  return contact;
}

export async function updateVendorContact(
  context: OrgContext,
  rawInput: {
    contactId: string;
    name?: string;
    role?: VendorContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<VendorContactRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = updateContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
  );
  if (!existing) throw new NotFoundError('Contact');

  const updated = await updateVendorContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
    {
      name: parsed.data.name,
      role: parsed.data.role,
      email: parsed.data.email,
      phone: parsed.data.phone,
      notes: parsed.data.notes,
    },
  );
  if (!updated) throw new NotFoundError('Contact');

  await recordAuditEvent(context, {
    action: 'vendor_contact.updated',
    entityType: 'vendor_contact',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function removeVendorContact(
  context: OrgContext,
  rawInput: { contactId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = deleteContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
  );
  if (!existing) throw new NotFoundError('Contact');

  await deleteVendorContact(context.db, context.organizationId, parsed.data.contactId);

  await recordAuditEvent(context, {
    action: 'vendor_contact.deleted',
    entityType: 'vendor_contact',
    entityId: existing.id,
    before: existing,
  });
}

export async function createVendorEngagement(
  context: OrgContext,
  rawInput: {
    vendorId: string;
    projectId: string;
    role?: string | null;
    notes?: string | null;
  },
): Promise<VendorEngagementRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = createEngagementSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const vendor = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');

  const engagement = await insertVendorEngagement(context.db, {
    organizationId: context.organizationId,
    vendorId: parsed.data.vendorId,
    projectId: parsed.data.projectId,
    role: parsed.data.role ?? null,
    notes: parsed.data.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: 'vendor_engagement.created',
    entityType: 'vendor_engagement',
    entityId: engagement.id,
    after: engagement,
  });

  return engagement;
}

export async function archiveVendorEngagement(
  context: OrgContext,
  rawInput: { engagementId: string },
): Promise<VendorEngagementRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = archiveEngagementSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findVendorEngagementById(
    context.db,
    context.organizationId,
    parsed.data.engagementId,
  );
  if (!existing) throw new NotFoundError('Engagement');

  const updated = await archiveVendorEngagementById(
    context.db,
    context.organizationId,
    parsed.data.engagementId,
  );
  if (!updated) throw new NotFoundError('Engagement');

  await recordAuditEvent(context, {
    action: 'vendor_engagement.archived',
    entityType: 'vendor_engagement',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
