import { and, eq } from 'drizzle-orm';
import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { projectDomains } from '@drizzle/schema';
import type { ProjectRecord } from '../domain/types';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import { updateProjectSchema, type UpdateProjectInput } from '../validation/schemas';

export async function updateProject(
  context: OrgContext,
  rawInput: UpdateProjectInput,
): Promise<ProjectRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = updateProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!existing) throw new NotFoundError('Project');
  assertSameOrganization(context, existing, 'Project');

  const updated = await updateProjectById(context.db, context.organizationId, input.projectId, {
    name: input.name,
    clientId: input.clientId,
    location: input.location,
    description: input.description,
    status: input.status,
    projectRole: input.projectRole,
    deliveryMode: input.deliveryMode,
    startDate: input.startDate,
    targetEndDate: input.targetEndDate,
    actualEndDate: input.actualEndDate,
    notes: input.notes,
  });

  if (!updated) throw new NotFoundError('Project');

  if (input.domainName !== undefined) {
    await context.db
      .delete(projectDomains)
      .where(
        and(
          eq(projectDomains.organizationId, context.organizationId),
          eq(projectDomains.projectId, input.projectId),
        ),
      );

    if (input.domainName) {
      await context.db.insert(projectDomains).values({
        organizationId: context.organizationId,
        projectId: input.projectId,
        adHocName: input.domainName,
      });
    }
  }

  await recordAuditEvent(context, {
    action: 'project.updated',
    entityType: 'project',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
