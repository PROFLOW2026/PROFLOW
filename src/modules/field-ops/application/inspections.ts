import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates/dates';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  canTransitionInspectionStatus,
  isCompletedInspectionStatus,
} from '../domain/inspection-status';
import type { InspectionStatus } from '../domain/types';
import {
  findInspectionById,
  insertInspection,
  listInspections,
  updateInspectionById,
} from '../data/field-ops.repository';
import {
  createInspectionSchema,
  updateInspectionSchema,
  type CreateInspectionInput,
  type UpdateInspectionInput,
} from '../validation/schemas';
import { assertProjectRefsInOrg } from './assert-project-refs';

export async function listInspectionsForOrg(
  context: OrgContext,
  filters: { projectId?: string; status?: InspectionStatus } = {},
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  return listInspections(context.db, context.organizationId, filters);
}

export async function getInspectionForOrg(context: OrgContext, inspectionId: string) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const item = await findInspectionById(context.db, context.organizationId, inspectionId);
  if (!item) throw new NotFoundError('Inspection');
  return item;
}

export async function createInspection(context: OrgContext, raw: CreateInspectionInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = createInspectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const inspection = await insertInspection(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    workPackageId: input.workPackageId ?? null,
    title: input.title,
    kind: input.kind ?? 'general',
    status: 'scheduled',
    scheduledOn: input.scheduledOn ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'field_ops');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INSPECTION_CREATED,
    entityType: 'inspection',
    entityId: inspection.id,
    after: { id: inspection.id, projectId: inspection.projectId, status: inspection.status },
  });
  return inspection;
}

export async function updateInspection(context: OrgContext, raw: UpdateInspectionInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = updateInspectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findInspectionById(context.db, context.organizationId, input.inspectionId);
  if (!existing) throw new NotFoundError('Inspection');

  if (
    input.status &&
    !canTransitionInspectionStatus(existing.status, input.status as InspectionStatus)
  ) {
    throw new DomainRuleError(
      `Cannot transition inspection from ${existing.status} to ${input.status}`,
      'fieldOps.errors.invalidInspectionTransition',
    );
  }

  if (input.workPackageId) {
    await assertProjectRefsInOrg(context, {
      projectId: existing.projectId,
      workPackageId: input.workPackageId,
    });
  }

  const nextStatus = (input.status as InspectionStatus | undefined) ?? existing.status;
  let completedOn = input.completedOn === undefined ? undefined : input.completedOn;
  if (
    input.status &&
    isCompletedInspectionStatus(nextStatus) &&
    completedOn === undefined &&
    !existing.completedOn
  ) {
    completedOn = todayInTimeZone(context.organization.timezone);
  }

  const updated = await updateInspectionById(
    context.db,
    context.organizationId,
    input.inspectionId,
    {
      title: input.title,
      kind: input.kind,
      status: input.status as InspectionStatus | undefined,
      scheduledOn: input.scheduledOn === undefined ? undefined : input.scheduledOn,
      completedOn,
      result: input.result === undefined ? undefined : input.result,
      notes: input.notes === undefined ? undefined : input.notes,
      workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
    },
  );
  if (!updated) throw new NotFoundError('Inspection');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.INSPECTION_UPDATED,
    entityType: 'inspection',
    entityId: updated.id,
    before: existing,
    after: updated,
  });
  return updated;
}
