import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { findProjectById } from '@/modules/projects';

export async function requireProjectInOrganization(context: OrgContext, projectId: string): Promise<void> {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('project');
}
