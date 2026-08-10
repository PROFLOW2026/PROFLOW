import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type {
  ProjectVendorEngagementSummary,
  VendorEngagementRecord,
  VendorEngagementSummary,
} from '../domain/types';
import {
  archiveVendorEngagementById,
  findProjectById,
  findVendorById,
  findVendorEngagementById,
  insertVendorEngagement,
  listEngagementsForProject,
  listEngagementsForVendor,
  updateVendorEngagementById,
} from '../data/vendors.repository';
import {
  archiveEngagementSchema,
  cancelEngagementSchema,
  createEngagementSchema,
  endEngagementSchema,
  listEngagementsSchema,
  type CancelEngagementInput,
  type CreateEngagementInput,
  type EndEngagementInput,
} from '../validation/schemas';

/**
 * Create a dated vendor↔project engagement.
 * Engagement alone never creates expense Actual, AP Actual, or labor Actual.
 * Multiple / overlapping projects are allowed when dates are legitimate.
 */
export async function createVendorEngagement(
  context: OrgContext,
  rawInput: CreateEngagementInput,
): Promise<VendorEngagementRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = createEngagementSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const vendor = await findVendorById(context.db, context.organizationId, parsed.data.vendorId);
  if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');

  const startDate =
    parsed.data.startDate ?? todayInTimeZone(context.organization.timezone);
  const endDate = parsed.data.endDate ?? null;

  const engagement = await insertVendorEngagement(context.db, {
    organizationId: context.organizationId,
    vendorId: parsed.data.vendorId,
    projectId: parsed.data.projectId,
    role: parsed.data.role ?? null,
    notes: parsed.data.notes ?? null,
    startDate,
    endDate,
    status: 'active',
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_ENGAGEMENT_CREATED,
    entityType: 'vendor_engagement',
    entityId: engagement.id,
    after: engagement,
  });

  return engagement;
}

/**
 * End an active engagement (sets endDate + status ended).
 * Does not write expense / AP / labor Actual.
 */
export async function endVendorEngagement(
  context: OrgContext,
  rawInput: EndEngagementInput,
): Promise<VendorEngagementRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = endEngagementSchema.safeParse(rawInput);
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
  if (!existing || existing.archivedAt || existing.status !== 'active') {
    throw new NotFoundError('Engagement');
  }

  const endDate =
    parsed.data.endDate ??
    existing.endDate ??
    todayInTimeZone(context.organization.timezone);

  if (existing.startDate && endDate < existing.startDate) {
    throw new ValidationError([
      { path: 'endDate', message: 'End date must be on or after start date' },
    ]);
  }

  const updated = await updateVendorEngagementById(
    context.db,
    context.organizationId,
    parsed.data.engagementId,
    { status: 'ended', endDate },
  );
  if (!updated) throw new NotFoundError('Engagement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_ENGAGEMENT_ENDED,
    entityType: 'vendor_engagement',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

/**
 * Cancel an active engagement. Does not write expense / AP / labor Actual.
 */
export async function cancelVendorEngagement(
  context: OrgContext,
  rawInput: CancelEngagementInput,
): Promise<VendorEngagementRecord> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = cancelEngagementSchema.safeParse(rawInput);
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
  if (!existing || existing.archivedAt || existing.status !== 'active') {
    throw new NotFoundError('Engagement');
  }

  const endDate =
    parsed.data.endDate ??
    existing.endDate ??
    todayInTimeZone(context.organization.timezone);

  const updated = await updateVendorEngagementById(
    context.db,
    context.organizationId,
    parsed.data.engagementId,
    { status: 'cancelled', endDate },
  );
  if (!updated) throw new NotFoundError('Engagement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_ENGAGEMENT_CANCELLED,
    entityType: 'vendor_engagement',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

/** Soft-hide engagement from UI lists. Prefer end/cancel for normal lifecycle. */
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
    action: AUDIT_ACTIONS.VENDOR_ENGAGEMENT_ARCHIVED,
    entityType: 'vendor_engagement',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

/** Active engagements for a project (contractors panel). */
export async function listProjectVendorEngagements(
  context: OrgContext,
  projectId: string,
): Promise<ProjectVendorEngagementSummary[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const parsed = listEngagementsSchema.safeParse({ projectId, status: 'active' });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  return listEngagementsForProject(context.db, context.organizationId, projectId, {
    status: 'active',
  });
}

/** Ended / cancelled engagements for a project (history). */
export async function listProjectVendorEngagementHistory(
  context: OrgContext,
  projectId: string,
): Promise<ProjectVendorEngagementSummary[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  return listEngagementsForProject(context.db, context.organizationId, projectId, {
    status: 'history',
  });
}

/** Active engagements for a vendor detail panel. */
export async function listVendorEngagements(
  context: OrgContext,
  vendorId: string,
): Promise<VendorEngagementSummary[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const vendor = await findVendorById(context.db, context.organizationId, vendorId);
  if (!vendor) throw new NotFoundError('Vendor');

  return listEngagementsForVendor(context.db, context.organizationId, vendorId, {
    status: 'active',
  });
}

/** Ended / cancelled engagements for a vendor (history). */
export async function listVendorEngagementHistory(
  context: OrgContext,
  vendorId: string,
): Promise<VendorEngagementSummary[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);

  const vendor = await findVendorById(context.db, context.organizationId, vendorId);
  if (!vendor) throw new NotFoundError('Vendor');

  return listEngagementsForVendor(context.db, context.organizationId, vendorId, {
    status: 'history',
  });
}
