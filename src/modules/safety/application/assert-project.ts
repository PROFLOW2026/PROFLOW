import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertCanAccessProject, findProjectById } from '@/modules/projects';

export async function assertOptionalProjectInOrg(
  context: OrgContext,
  projectId: string | null | undefined,
): Promise<void> {
  if (!projectId) return;
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');
  await assertCanAccessProject(context, projectId);
}

export function occurredDateString(occurredAt: Date): string {
  return occurredAt.toISOString().slice(0, 10);
}

export function requireToolboxTopic(
  recordType: string,
  topic: string | null | undefined,
): string | null {
  if (recordType !== 'toolbox_talk') return topic ?? null;
  const trimmed = topic?.trim() ?? '';
  if (!trimmed) {
    throw new DomainRuleError(
      'Toolbox talks need a topic',
      'safety.errors.toolboxTopicRequired',
    );
  }
  return trimmed;
}
