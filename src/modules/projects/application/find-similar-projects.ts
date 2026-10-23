import type { OrgContext } from '@/shared/auth/context';
import { findSimilarProjects } from '../data/projects.repository';

export async function listSimilarProjects(
  context: OrgContext,
  input: {
    readonly excludeProjectId: string;
    readonly name: string;
    readonly clientId: string | null;
  },
) {
  return findSimilarProjects(context.db, context.organizationId, input);
}
