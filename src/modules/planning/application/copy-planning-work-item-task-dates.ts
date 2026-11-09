import { and, eq, isNull } from 'drizzle-orm';
import { tasks } from '@drizzle/schema';
import type { WorkKind } from '@/modules/projects/domain/types';
import { updateTask } from '@/modules/tasks/application/update-task';
import { findTaskById } from '@/modules/tasks';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import type { PlanningRepository } from '../data/planning.repository';
import { getPlanningRepository } from '../data/resolve-repository';
import { assertPlanningEligible } from '../domain/eligibility';
import {
  mapPlanningDatesToTaskUpdate,
  mapTaskDatesToPlanningUpdate,
} from '../domain/planning-task-date-copy';
import type { PlanningWorkItem } from '../domain/types';

export interface CopyPlanningWorkItemTaskDatesOptions {
  readonly repo?: PlanningRepository;
  readonly db?: DbExecutor | null;
}

function assertLinkedTaskRow(item: PlanningWorkItem): asserts item is PlanningWorkItem & {
  readonly taskId: string;
} {
  if (item.kind !== 'task') {
    throw new DomainRuleError(
      'Milestones cannot sync dates with tasks',
      'planning.link.milestoneNotLinkable',
    );
  }
  if (!item.taskId) {
    throw new DomainRuleError(
      'Planning row has no linked task',
      'planning.write.taskLink.dateCopyRequiresLink',
    );
  }
}

async function loadWorkItem(
  repo: PlanningRepository,
  organizationId: string,
  projectId: string,
  workItemId: string,
): Promise<PlanningWorkItem> {
  const plan = await repo.getPlan(organizationId, projectId);
  const item = plan.workItems.find((row) => row.id === workItemId);
  if (!item || item.archivedAt) {
    throw new NotFoundError('Planning work item');
  }
  return item;
}

async function assertTaskInProject(
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

/**
 * Overwrites the linked task's start/due dates from the planning row (explicit action only).
 */
export async function copyPlanningWorkItemDatesToLinkedTask(
  context: OrgContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly workItemId: string;
    readonly workKind: WorkKind;
  },
  options: CopyPlanningWorkItemTaskDatesOptions | PlanningRepository = {},
): Promise<string> {
  const opts: CopyPlanningWorkItemTaskDatesOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as CopyPlanningWorkItemTaskDatesOptions);

  assertPlanningEligible(input.workKind);
  const db = opts.db ?? context.db;
  const repo = opts.repo ?? getPlanningRepository(db);

  const item = await loadWorkItem(repo, input.organizationId, input.projectId, input.workItemId);
  assertLinkedTaskRow(item);
  await assertTaskInProject(db, input.organizationId, input.projectId, item.taskId);

  const patch = mapPlanningDatesToTaskUpdate({
    startDate: item.startDate,
    targetEndDate: item.targetEndDate,
  });
  await updateTask(context, item.taskId, patch);
  return item.taskId;
}

/**
 * Overwrites the planning row's start/target-end dates from the linked task (explicit action only).
 */
export async function copyLinkedTaskDatesToPlanningWorkItem(
  context: OrgContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly workItemId: string;
    readonly workKind: WorkKind;
  },
  options: CopyPlanningWorkItemTaskDatesOptions | PlanningRepository = {},
): Promise<PlanningWorkItem> {
  const opts: CopyPlanningWorkItemTaskDatesOptions =
    options && 'upsertWorkItem' in options
      ? { repo: options as PlanningRepository }
      : (options as CopyPlanningWorkItemTaskDatesOptions);

  assertPlanningEligible(input.workKind);
  const db = opts.db ?? context.db;
  const repo = opts.repo ?? getPlanningRepository(db);

  const item = await loadWorkItem(repo, input.organizationId, input.projectId, input.workItemId);
  assertLinkedTaskRow(item);
  await assertTaskInProject(db, input.organizationId, input.projectId, item.taskId);

  const task = await findTaskById(db, input.organizationId, item.taskId);
  if (!task) {
    throw new NotFoundError('Task');
  }

  const dates = mapTaskDatesToPlanningUpdate({
    startDate: task.startDate,
    dueDate: task.dueDate,
  });

  const now = new Date();
  return repo.upsertWorkItem({
    ...item,
    startDate: dates.startDate,
    targetEndDate: dates.targetEndDate,
    updatedAt: now,
  });
}
