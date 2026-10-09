import { and, eq, isNull } from 'drizzle-orm';
import { tasks } from '@drizzle/schema';
import type { WorkKind } from '@/modules/projects/domain/types';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import type { PlanningRepository } from '../data/planning.repository';
import { getPlanningRepository } from '../data/resolve-repository';
import { assertPlanningEligible } from '../domain/eligibility';
import type { PlanningWorkItem } from '../domain/types';

export interface LinkPlanningWorkItemTaskOptions {
  readonly repo?: PlanningRepository;
  readonly db?: DbExecutor | null;
}

async function assertTaskLinkable(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  taskId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        eq(tasks.organizationId, organizationId),
        eq(tasks.projectId, projectId),
        isNull(tasks.archivedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new NotFoundError('Task');
  }
}

export async function linkPlanningWorkItemToTask(
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly workItemId: string;
    readonly taskId: string;
    readonly workKind: WorkKind;
  },
  options: LinkPlanningWorkItemTaskOptions | PlanningRepository = {},
): Promise<PlanningWorkItem> {
  const opts: LinkPlanningWorkItemTaskOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as LinkPlanningWorkItemTaskOptions);

  assertPlanningEligible(input.workKind);
  const repo = opts.repo ?? getPlanningRepository(opts.db);
  const db = opts.db;
  if (!db) {
    throw new Error('linkPlanningWorkItemToTask requires db');
  }

  await assertTaskLinkable(db, input.organizationId, input.projectId, input.taskId);

  const plan = await repo.getPlan(input.organizationId, input.projectId);
  const existing = plan.workItems.find((item) => item.id === input.workItemId);
  if (!existing || existing.archivedAt) {
    throw new NotFoundError('Planning work item');
  }
  if (existing.kind !== 'task') {
    throw new Error('planning.link.milestoneNotLinkable');
  }

  const now = new Date();
  return repo.upsertWorkItem({
    ...existing,
    taskId: input.taskId,
    updatedAt: now,
  });
}

export async function unlinkPlanningWorkItemTask(
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly workItemId: string;
    readonly workKind: WorkKind;
  },
  options: LinkPlanningWorkItemTaskOptions | PlanningRepository = {},
): Promise<PlanningWorkItem> {
  const opts: LinkPlanningWorkItemTaskOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as LinkPlanningWorkItemTaskOptions);

  assertPlanningEligible(input.workKind);
  const repo = opts.repo ?? getPlanningRepository(opts.db);

  const plan = await repo.getPlan(input.organizationId, input.projectId);
  const existing = plan.workItems.find((item) => item.id === input.workItemId);
  if (!existing || existing.archivedAt) {
    throw new NotFoundError('Planning work item');
  }

  const now = new Date();
  return repo.upsertWorkItem({
    ...existing,
    taskId: null,
    updatedAt: now,
  });
}
