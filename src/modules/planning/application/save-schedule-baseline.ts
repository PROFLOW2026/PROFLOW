import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findProjectById } from '@/modules/projects';
import { NotFoundError } from '@/shared/errors';
import {
  buildBaselineItemsFromWorkItems,
  type BaselineScheduleItem,
} from '../domain/baseline-snapshot';
import { PlanningEligibilityError, assertPlanningEligible } from '../domain/eligibility';
import { insertPlanningBaselineWithSnapshot } from '../data/planning-baselines.repository';
import type { LatestBaselineWithSnapshot } from '../data/planning-baselines.repository';
import { getPlanningRepository } from '../data/resolve-repository';

export interface SaveScheduleBaselineInput {
  readonly projectId: string;
  readonly label?: string | null;
}

export async function saveScheduleBaseline(
  context: OrgContext,
  input: SaveScheduleBaselineInput,
): Promise<LatestBaselineWithSnapshot> {
  assertPermission(context, PERMISSIONS.PLANNING_WRITE);
  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('project');
  if (project.workKind !== 'project') {
    throw new PlanningEligibilityError('planning is only available for classic projects');
  }

  assertPlanningEligible(project.workKind);

  const repo = getPlanningRepository(context.db);
  const snapshot = await repo.getPlan(context.organizationId, input.projectId);
  const items: readonly BaselineScheduleItem[] = buildBaselineItemsFromWorkItems(
    snapshot.workItems,
  );

  return insertPlanningBaselineWithSnapshot(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    label: input.label?.trim() ? input.label.trim() : null,
    createdByUserId: context.userId,
    items,
  });
}
