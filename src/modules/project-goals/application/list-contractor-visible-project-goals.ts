import 'server-only';

import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { AuthorizationError } from '@/shared/errors';
import type { ProjectGoalRecord } from '../domain/types';

/**
 * Contractor goals list — fail-closed visibility filter.
 *
 * Product rule: contractors see only goals marked visible to them. Generic
 * `ext.project.view` must never dump the full `project_goals` table (BUG-015 / no-leak).
 *
 * There is no contractor-visibility column on `project_goals` while drizzle migrations
 * are frozen for this change set. Until that marking exists, this returns an empty list
 * after verifying the principal has a project-covering grant (route discoverability only).
 */
export async function listContractorVisibleProjectGoals(
  context: ExternalContext,
  projectId: string,
): Promise<readonly ProjectGoalRecord[]> {
  const covered = context.grants.some(
    (grant) =>
      grant.capabilities.has(EXTERNAL_CAPABILITIES.PROJECT_VIEW) &&
      (grant.projectId === null || grant.projectId === projectId),
  );
  if (!covered) {
    throw new AuthorizationError(EXTERNAL_CAPABILITIES.PROJECT_VIEW);
  }

  // Intentional empty: no visibility marks exist without a schema column.
  // Do not call listProjectGoalRows / service-role full-table reads here.
  void context;
  return [];
}
