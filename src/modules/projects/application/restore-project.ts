import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ProjectRecord } from '../domain/types';
import { buildProjectRestorePatch } from '../domain/soft-archive';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import { restoreProjectSchema } from '../validation/schemas';

export async function restoreProject(
  context: OrgContext,
  rawInput: { projectId: string },
): Promise<ProjectRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_ARCHIVE);

  const parsed = restoreProjectSchema.safeParse(rawInput);
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

  const updated = await updateProjectById(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    buildProjectRestorePatch(),
  );

  if (!updated) throw new NotFoundError('Project');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_RESTORED,
    entityType: 'project',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
