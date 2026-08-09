import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { MilestoneRecord } from '../domain/types';
import { findProjectById } from '../data/projects.repository';
import { findWorkPackageById } from '../data/work-packages.repository';
import {
  findMilestoneById,
  insertMilestone,
  listMilestonesByProject,
  updateMilestoneById,
} from '../data/milestones.repository';
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  type CreateMilestoneInput,
  type UpdateMilestoneInput,
} from '../validation/schemas';

export async function listProjectMilestones(
  context: OrgContext,
  projectId: string,
): Promise<MilestoneRecord[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  return listMilestonesByProject(context.db, context.organizationId, projectId);
}

export async function createMilestone(
  context: OrgContext,
  rawInput: CreateMilestoneInput,
): Promise<MilestoneRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = createMilestoneSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('Project');

  if (input.workPackageId) {
    const workPackage = await findWorkPackageById(
      context.db,
      context.organizationId,
      input.workPackageId,
    );
    if (!workPackage || workPackage.projectId !== input.projectId) {
      throw new NotFoundError('Work area');
    }
  }

  const milestone = await insertMilestone(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    workPackageId: input.workPackageId,
    name: input.name,
    targetDate: input.targetDate,
    notes: input.notes,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MILESTONE_CREATED,
    entityType: 'project_milestone',
    entityId: milestone.id,
    after: milestone,
  });

  return milestone;
}

export async function updateMilestone(
  context: OrgContext,
  rawInput: UpdateMilestoneInput,
): Promise<MilestoneRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = updateMilestoneSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findMilestoneById(context.db, context.organizationId, input.milestoneId);
  if (!existing) throw new NotFoundError('Milestone');

  if (input.workPackageId) {
    const workPackage = await findWorkPackageById(
      context.db,
      context.organizationId,
      input.workPackageId,
    );
    if (!workPackage || workPackage.projectId !== existing.projectId) {
      throw new NotFoundError('Work area');
    }
  }

  const status = input.status ?? existing.status;
  const completedAt =
    input.completedAt !== undefined
      ? input.completedAt
      : status === 'achieved' && !existing.completedAt
        ? new Date().toISOString().slice(0, 10)
        : existing.completedAt;

  const updated = await updateMilestoneById(context.db, context.organizationId, input.milestoneId, {
    name: input.name,
    workPackageId: input.workPackageId,
    targetDate: input.targetDate,
    completedAt,
    status,
    notes: input.notes,
  });

  if (!updated) throw new NotFoundError('Milestone');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MILESTONE_UPDATED,
    entityType: 'project_milestone',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function archiveMilestone(context: OrgContext, milestoneId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const existing = await findMilestoneById(context.db, context.organizationId, milestoneId);
  if (!existing) throw new NotFoundError('Milestone');

  await updateMilestoneById(context.db, context.organizationId, milestoneId, {
    archivedAt: new Date(),
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MILESTONE_ARCHIVED,
    entityType: 'project_milestone',
    entityId: milestoneId,
    before: existing,
  });
}
