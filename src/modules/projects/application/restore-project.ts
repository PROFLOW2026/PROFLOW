import { and, desc, eq } from 'drizzle-orm';
import { auditEvents } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { asServiceRoleWrite } from '@/shared/db';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ProjectRecord } from '../domain/types';
import { buildProjectRestorePatch } from '../domain/soft-archive';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import { restoreProjectSchema } from '../validation/schemas';

/**
 * Latest `project.archived` snapshot for this organization and project.
 * `before.status` is the status to restore.
 *
 * The request runs as `authenticated`, and audit_events SELECT requires
 * `audit.read`. Restore is authorized by `projects.archive`, so this read is
 * elevated, limited to that one project, and never returned to the client.
 */
async function findLatestProjectArchiveBefore(
  context: OrgContext,
  projectId: string,
): Promise<unknown> {
  return asServiceRoleWrite(context.db, async () => {
    const [event] = await context.db
      .select({ before: auditEvents.before })
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.organizationId, context.organizationId),
          eq(auditEvents.entityType, 'project'),
          eq(auditEvents.entityId, projectId),
          eq(auditEvents.action, AUDIT_ACTIONS.PROJECT_ARCHIVED),
        ),
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(1);

    return event?.before ?? null;
  });
}

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

  const archiveBefore = await findLatestProjectArchiveBefore(context, parsed.data.projectId);

  const updated = await updateProjectById(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    buildProjectRestorePatch(archiveBefore),
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
