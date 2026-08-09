import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { WorkPackageRecord } from '../domain/types';
import { findProjectById } from '../data/projects.repository';
import {
  findDefaultWorkPackage,
  findWorkPackageById,
  insertWorkPackage,
  listWorkPackagesByProject,
  nextWorkPackageSortOrder,
  updateWorkPackageById,
} from '../data/work-packages.repository';
import {
  archiveWorkPackageSchema,
  createWorkPackageSchema,
  splitProjectSchema,
  updateWorkPackageSchema,
} from '../validation/schemas';

export async function createWorkPackage(
  context: OrgContext,
  rawInput: { projectId: string; name: string; description?: string | null },
): Promise<WorkPackageRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = createWorkPackageSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const sortOrder = await nextWorkPackageSortOrder(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );

  const workPackage = await insertWorkPackage(context.db, {
    organizationId: context.organizationId,
    projectId: parsed.data.projectId,
    name: parsed.data.name,
    sortOrder,
    description: parsed.data.description ?? null,
  });

  await recordAuditEvent(context, {
    action: 'work_package.created',
    entityType: 'work_package',
    entityId: workPackage.id,
    after: workPackage,
  });

  return workPackage;
}

export async function updateWorkPackage(
  context: OrgContext,
  rawInput: {
    workPackageId: string;
    name?: string;
    description?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    progressPercent?: string | null;
  },
): Promise<WorkPackageRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = updateWorkPackageSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findWorkPackageById(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
  );
  if (!existing) throw new NotFoundError('Work area');

  const updated = await updateWorkPackageById(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
    {
      name: parsed.data.name,
      description: parsed.data.description,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      progressPercent: parsed.data.progressPercent,
    },
  );
  if (!updated) throw new NotFoundError('Work area');

  await recordAuditEvent(context, {
    action: 'work_package.updated',
    entityType: 'work_package',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function archiveWorkPackage(
  context: OrgContext,
  rawInput: { workPackageId: string },
): Promise<WorkPackageRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = archiveWorkPackageSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findWorkPackageById(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
  );
  if (!existing) throw new NotFoundError('Work area');
  if (existing.isDefault) {
    throw new DomainRuleError(
      'The default work area cannot be archived',
      'projects.errors.defaultWorkPackageArchive',
    );
  }

  const activePackages = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    existing.projectId,
  );
  if (activePackages.length <= 1) {
    throw new DomainRuleError(
      'A project must keep at least one work area',
      'projects.errors.lastWorkPackage',
    );
  }

  const updated = await updateWorkPackageById(
    context.db,
    context.organizationId,
    parsed.data.workPackageId,
    { archivedAt: new Date() },
  );
  if (!updated) throw new NotFoundError('Work area');

  await recordAuditEvent(context, {
    action: 'work_package.archived',
    entityType: 'work_package',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

/**
 * Reveals multi-package UI by renaming the default package and adding areas (doc 43 Flow 3).
 */
export async function splitProjectIntoWorkPackages(
  context: OrgContext,
  rawInput: {
    projectId: string;
    defaultPackageName?: string;
    additionalPackages?: string[];
  },
): Promise<WorkPackageRecord[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = splitProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const defaultPackage = await findDefaultWorkPackage(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  if (!defaultPackage) throw new NotFoundError('Work area');

  if (parsed.data.defaultPackageName) {
    await updateWorkPackageById(
      context.db,
      context.organizationId,
      defaultPackage.id,
      { name: parsed.data.defaultPackageName },
    );
  }

  const created: WorkPackageRecord[] = [];
  for (const name of parsed.data.additionalPackages ?? []) {
    const pkg = await createWorkPackage(context, {
      projectId: parsed.data.projectId,
      name,
    });
    created.push(pkg);
  }

  return listWorkPackagesByProject(context.db, context.organizationId, parsed.data.projectId);
}
