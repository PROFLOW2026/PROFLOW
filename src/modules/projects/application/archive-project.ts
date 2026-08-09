import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ProjectRecord } from '../domain/types';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import { archiveProjectSchema } from '../validation/schemas';

export async function archiveProject(
  context: OrgContext,
  rawInput: { projectId: string },
): Promise<ProjectRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_ARCHIVE);

  const parsed = archiveProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findProjectById(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  if (!existing) throw new NotFoundError('Project');
  assertSameOrganization(context, existing, 'Project');

  const archivedAt = new Date();
  const updated = await updateProjectById(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    { status: 'archived', archivedAt },
  );

  if (!updated) throw new NotFoundError('Project');

  await recordAuditEvent(context, {
    action: 'project.archived',
    entityType: 'project',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
