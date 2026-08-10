import { buildCriticalPathFoundation } from '../domain/critical-path-foundation';
import { assertPlanningEligible } from '../domain/eligibility';
import { buildGanttModel } from '../domain/gantt-layout';
import { countOverdueWorkItems, listOverdueWorkItems } from '../domain/overdue';
import type { PlanningRepository } from '../data/planning.repository';
import { getPlanningRepository } from '../data/resolve-repository';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CriticalPathFoundation,
  GanttModel,
  PlanningOverdueFlags,
  PlanningPlanSnapshot,
} from '../domain/types';
import {
  listPlanningPlanSchema,
  type ListPlanningPlanInput,
} from '../validation/schemas';

export interface PlanningPlanView {
  readonly snapshot: PlanningPlanSnapshot;
  readonly gantt: GanttModel | null;
  readonly overdue: readonly PlanningOverdueFlags[];
  readonly overdueCount: number;
  readonly criticalPathFoundation: CriticalPathFoundation;
}

export interface ListPlanningPlanOptions {
  readonly repo?: PlanningRepository;
  readonly db?: DbExecutor | null;
}

export async function listPlanningPlan(
  input: ListPlanningPlanInput,
  options: ListPlanningPlanOptions | PlanningRepository = {},
): Promise<PlanningPlanView> {
  const opts: ListPlanningPlanOptions =
    options && 'getPlan' in options
      ? { repo: options as PlanningRepository }
      : (options as ListPlanningPlanOptions);

  const parsed = listPlanningPlanSchema.parse(input);
  assertPlanningEligible(parsed.workKind);

  const repo = opts.repo ?? getPlanningRepository(opts.db);
  const snapshot = await repo.getPlan(parsed.organizationId, parsed.projectId);
  const activeItems = snapshot.workItems.filter((item) => !item.archivedAt);
  const gantt = buildGanttModel({
    workItems: activeItems,
    dependencies: snapshot.dependencies,
    today: parsed.today,
  });
  const overdue = listOverdueWorkItems(activeItems, parsed.today);

  return {
    snapshot: { ...snapshot, workItems: activeItems },
    gantt,
    overdue,
    overdueCount: countOverdueWorkItems(activeItems, parsed.today),
    criticalPathFoundation: buildCriticalPathFoundation({
      projectId: parsed.projectId,
      workItems: activeItems,
      dependencies: snapshot.dependencies,
    }),
  };
}
