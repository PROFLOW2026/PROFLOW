import { findTemplateById } from '@/modules/forms/lookups';
import { hasSubmittedFormForOwner } from '@/modules/forms';
import { findEmployeeById } from '@/modules/workforce';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates/dates';
import { assertCanAccessProject, isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import { assertInspectionCompletionForm } from '../domain/inspection-form-gate';
import {
  canTransitionInspectionStatus,
  isCompletedInspectionStatus,
} from '../domain/inspection-status';
import type { InspectionStatus } from '../domain/types';
import {
  findInspectionById,
  findInspectionByIdForUpdate,
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

async function assertInspectionRefs(
  context: OrgContext,
  input: { inspectorEmployeeId?: string | null; formTemplateId?: string | null },
) {
  if (input.inspectorEmployeeId) {
    const employee = await findEmployeeById(
      context.db,
      context.organizationId,
      input.inspectorEmployeeId,
    );
    if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
  }
  if (input.formTemplateId) {
    const template = await findTemplateById(
      context.db,
      context.organizationId,
      input.formTemplateId,
    );
    if (!template || template.archivedAt) throw new NotFoundError('Form template');
  }
}

export async function listInspectionsForOrg(
  context: OrgContext,
  filters: { projectId?: string; status?: InspectionStatus } = {},
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const [allowed, rows] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listInspections(context.db, context.organizationId, filters),
  ]);
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

export async function getInspectionForOrg(context: OrgContext, inspectionId: string) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const item = await findInspectionById(context.db, context.organizationId, inspectionId);
  if (!item) throw new NotFoundError('Inspection');
  await assertCanAccessProject(context, item.projectId);
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
  await assertInspectionRefs(context, {
    inspectorEmployeeId: input.inspectorEmployeeId,
    formTemplateId: input.formTemplateId,
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
    inspectorEmployeeId: input.inspectorEmployeeId ?? null,
    formTemplateId: input.formTemplateId ?? null,
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

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findInspectionByIdForUpdate(
      tx,
      context.organizationId,
      input.inspectionId,
    );
    if (!existing) throw new NotFoundError('Inspection');
    await assertCanAccessProject(txContext, existing.projectId);

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
      await assertProjectRefsInOrg(txContext, {
        projectId: existing.projectId,
        workPackageId: input.workPackageId,
      });
    }

    await assertInspectionRefs(txContext, {
      inspectorEmployeeId: input.inspectorEmployeeId,
      formTemplateId: input.formTemplateId,
    });

    const nextStatus = (input.status as InspectionStatus | undefined) ?? existing.status;
    const statusChanging = input.status !== undefined && input.status !== existing.status;
    const nextTemplateId =
      input.formTemplateId === undefined ? existing.formTemplateId : input.formTemplateId;

    if (statusChanging && isCompletedInspectionStatus(nextStatus)) {
      const submitted = nextTemplateId
        ? await hasSubmittedFormForOwner(tx, context.organizationId, {
            ownerType: 'inspection',
            ownerId: existing.id,
            templateId: nextTemplateId,
          })
        : false;
      assertInspectionCompletionForm({
        targetStatus: nextStatus,
        formTemplateId: nextTemplateId,
        submissions: nextTemplateId
          ? [{ templateId: nextTemplateId, status: submitted ? 'submitted' : 'draft' }]
          : [],
      });
    }

    let completedOn = input.completedOn === undefined ? undefined : input.completedOn;
    if (
      statusChanging &&
      isCompletedInspectionStatus(nextStatus) &&
      completedOn === undefined &&
      !existing.completedOn
    ) {
      completedOn = todayInTimeZone(context.organization.timezone);
    }

    const updated = await updateInspectionById(
      tx,
      context.organizationId,
      input.inspectionId,
      {
        title: input.title,
        kind: input.kind,
        status: statusChanging ? (input.status as InspectionStatus) : undefined,
        scheduledOn: input.scheduledOn === undefined ? undefined : input.scheduledOn,
        completedOn,
        result: input.result === undefined ? undefined : input.result,
        notes: input.notes === undefined ? undefined : input.notes,
        workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
        inspectorEmployeeId:
          input.inspectorEmployeeId === undefined ? undefined : input.inspectorEmployeeId,
        formTemplateId: input.formTemplateId === undefined ? undefined : input.formTemplateId,
      },
      statusChanging ? { fromStatuses: [existing.status] } : undefined,
    );
    if (!updated) throw new ConflictError('Inspection was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.INSPECTION_UPDATED,
      entityType: 'inspection',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
}
