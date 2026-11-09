import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findProjectById } from '@/modules/projects';
import { NotFoundError } from '@/shared/errors';
import {
  compareBaselineToCurrent,
  type BaselineDateComparisonRow,
} from '../domain/baseline-snapshot';
import { findLatestBaselineWithSnapshot } from '../data/planning-baselines.repository';
import { getPlanningRepository } from '../data/resolve-repository';

export interface BaselineComparisonView {
  readonly latestBaselineCreatedAt: Date | null;
  readonly latestBaselineLabel: string | null;
  readonly rows: readonly BaselineDateComparisonRow[];
}

export async function loadBaselineComparison(
  context: OrgContext,
  projectId: string,
): Promise<BaselineComparisonView> {
  assertPermission(context, PERMISSIONS.PLANNING_READ);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('project');
  if (project.workKind !== 'project') {
    return { latestBaselineCreatedAt: null, latestBaselineLabel: null, rows: [] };
  }

  const latest = await findLatestBaselineWithSnapshot(
    context.db,
    context.organizationId,
    projectId,
  );
  if (!latest) {
    return { latestBaselineCreatedAt: null, latestBaselineLabel: null, rows: [] };
  }

  const repo = getPlanningRepository(context.db);
  const plan = await repo.getPlan(context.organizationId, projectId);
  const rows = compareBaselineToCurrent(latest.snapshot.items, plan.workItems);

  return {
    latestBaselineCreatedAt: latest.baseline.createdAt,
    latestBaselineLabel: latest.baseline.label,
    rows,
  };
}
