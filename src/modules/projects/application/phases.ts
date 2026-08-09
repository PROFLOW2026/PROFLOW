import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { PhaseRecord } from '../domain/types';
import { findProjectById } from '../data/projects.repository';
import { findWorkPackageById } from '../data/work-packages.repository';
import {
  findPhaseById,
  insertPhase,
  nextPhaseSortOrder,
  updatePhaseById,
} from '../data/phases.repository';
import {
  archivePhaseSchema,
  createPhaseSchema,
  updatePhaseSchema,
} from '../validation/schemas';

export async function createPhase(
  context: OrgContext,
  rawInput: {
    workPackageId: string;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<PhaseRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = createPhaseSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const workPackage = await findWorkPackageById(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
  );
  if (!workPackage) throw new NotFoundError('Work package');

  const project = await findProjectById(context.db, context.organizationId, workPackage.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const sortOrder = await nextPhaseSortOrder(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
  );

  const phase = await insertPhase(context.db, {
    organizationId: context.organizationId,
    projectId: workPackage.projectId,
    workPackageId: parsed.data.workPackageId,
    name: parsed.data.name,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
    sortOrder,
  });

  await recordAuditEvent(context, {
    action: 'phase.created',
    entityType: 'phase',
    entityId: phase.id,
    after: phase,
  });

  return phase;
}

export async function updatePhase(
  context: OrgContext,
  rawInput: {
    phaseId: string;
    name?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<PhaseRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = updatePhaseSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findPhaseById(context.db, context.organizationId, parsed.data.phaseId);
  if (!existing) throw new NotFoundError('Phase');

  const updated = await updatePhaseById(context.db, context.organizationId, parsed.data.phaseId, {
    name: parsed.data.name,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
  });
  if (!updated) throw new NotFoundError('Phase');

  await recordAuditEvent(context, {
    action: 'phase.updated',
    entityType: 'phase',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function archivePhase(
  context: OrgContext,
  rawInput: { phaseId: string },
): Promise<PhaseRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = archivePhaseSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findPhaseById(context.db, context.organizationId, parsed.data.phaseId);
  if (!existing) throw new NotFoundError('Phase');

  const updated = await updatePhaseById(context.db, context.organizationId, parsed.data.phaseId, {
    archivedAt: new Date(),
  });
  if (!updated) throw new NotFoundError('Phase');

  await recordAuditEvent(context, {
    action: 'phase.archived',
    entityType: 'phase',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
