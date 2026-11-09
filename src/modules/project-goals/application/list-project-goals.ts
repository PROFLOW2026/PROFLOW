import type { OrgContext } from '@/shared/auth/context';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';
import { assertProjectCapability } from '@/modules/project-team/application/capability-guard';
import { listProjectGoalRows } from '../data/project-goals.repository';
import type { ProjectGoalRecord } from '../domain/types';
import { requireProjectInOrganization } from './shared';

export async function listProjectGoals(
  context: OrgContext,
  projectId: string,
): Promise<readonly ProjectGoalRecord[]> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  await requireProjectInOrganization(context, projectId);
  return listProjectGoalRows(context.db, context.organizationId, projectId);
}
