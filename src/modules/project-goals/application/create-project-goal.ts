import type { OrgContext } from '@/shared/auth/context';
import { insertProjectGoalRow } from '../data/project-goals.repository';
import type { CreateProjectGoalInput, ProjectGoalRecord } from '../domain/types';
import { parseCreateProjectGoal } from '../validation/schemas';
import { assertProjectGoalMutationAccess } from './goal-mutation-access';
import { requireProjectInOrganization } from './shared';

export async function createProjectGoal(
  context: OrgContext,
  input: CreateProjectGoalInput,
): Promise<ProjectGoalRecord> {
  assertProjectGoalMutationAccess(context);
  const parsed = parseCreateProjectGoal(input);
  await requireProjectInOrganization(context, parsed.projectId);
  return insertProjectGoalRow(context.db, {
    organizationId: context.organizationId,
    projectId: parsed.projectId,
    title: parsed.title,
    ownerUserId: parsed.ownerUserId ?? context.userId,
    dueOn: parsed.dueOn,
    status: parsed.status,
    progressPercent: parsed.progressPercent,
  });
}
