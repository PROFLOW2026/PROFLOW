import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { updateProjectGoalStatusRow } from '../data/project-goals.repository';
import type { ProjectGoalRecord, UpdateProjectGoalStatusInput } from '../domain/types';
import { parseUpdateProjectGoalStatus } from '../validation/schemas';
import { assertProjectGoalMutationAccess } from './goal-mutation-access';
import { requireProjectInOrganization } from './shared';

export async function updateProjectGoalStatus(
  context: OrgContext,
  input: UpdateProjectGoalStatusInput,
): Promise<ProjectGoalRecord> {
  assertProjectGoalMutationAccess(context);
  const parsed = parseUpdateProjectGoalStatus(input);
  await requireProjectInOrganization(context, parsed.projectId);
  const updated = await updateProjectGoalStatusRow(
    context.db,
    context.organizationId,
    parsed.projectId,
    parsed.goalId,
    parsed.status,
  );
  if (!updated) throw new NotFoundError('project_goal');
  return updated;
}
