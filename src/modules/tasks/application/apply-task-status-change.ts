import { NotFoundError, DomainRuleError } from '@/shared/errors';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import {
  findTaskById,
  updateTaskById,
  insertTaskActivity,
  listOpenPredecessorsForTask,
} from '../data/tasks.repository';
import { listBucketsForBoard } from '../data/boards.repository';
import { isValidTransition, transitionTask } from '../domain/lifecycle';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { readTaskDependencyPolicy } from '../data/dependency-policy.repository';
import { evaluateDependencyGate } from '../domain/dependency-gate';
import { assertTaskCompletionApprovalSatisfied } from './submit-task-approval';
import { notifyTaskFollowersOfStatusChange } from './notify-task-followers';
import { notifySuccessorsWhenDependenciesResolved } from './notify-task-dependency-resolved';
import type { Task, TaskStatus } from '../domain/types';

export type TaskStatusChangeActor =
  | { readonly kind: 'member' }
  | { readonly kind: 'employee'; readonly employeeId: string }
  | { readonly kind: 'system' };

export interface ApplyTaskStatusChangeOptions {
  readonly confirmDependencyWarning?: boolean;
  readonly dependencyOverrideReason?: string | null;
}

function activityActorFields(context: OrgContext, actor: TaskStatusChangeActor) {
  if (actor.kind === 'employee') {
    return {
      actorOrgMemberId: null,
      actorEmployeeId: actor.employeeId,
      actorSystem: false,
    };
  }
  if (actor.kind === 'system') {
    return {
      actorOrgMemberId: null,
      actorEmployeeId: null,
      actorSystem: true,
    };
  }
  return buildActivityActorFieldsFromContext(context);
}

async function bucketIdForStatus(
  context: OrgContext,
  boardId: string | null,
  status: TaskStatus,
): Promise<string | null | undefined> {
  if (!boardId) return undefined;
  const buckets = await listBucketsForBoard(context.db, context.organizationId, boardId);
  const match = buckets.find((bucket) => bucket.statusOnEnter === status);
  return match?.id ?? undefined;
}

async function assertDependencyGateAllowsStatusChange(
  context: OrgContext,
  taskId: string,
  newStatus: TaskStatus,
  actor: TaskStatusChangeActor,
  options: ApplyTaskStatusChangeOptions,
): Promise<'allow' | 'override'> {
  if (actor.kind === 'system') return 'allow';

  const policy = await readTaskDependencyPolicy(context.db, context.organizationId);
  const openPredecessors = await listOpenPredecessorsForTask(
    context.db,
    context.organizationId,
    taskId,
  );

  const decision = evaluateDependencyGate({
    policy,
    targetStatus: newStatus,
    openPredecessors,
    permissions: context.permissions,
    confirmDependencyWarning: options.confirmDependencyWarning === true,
    dependencyOverrideReason: options.dependencyOverrideReason,
    actorIsSystem: false,
  });

  if (decision === 'allow') return 'allow';

  const predecessorPayload = openPredecessors.map((row) => ({
    taskId: row.taskId,
    title: row.title,
    status: row.status,
  }));

  if (decision === 'warn') {
    throw new DomainRuleError(
      'Open predecessors require confirmation before this status change',
      'tasks.errors.dependencyWarningRequired',
      {
        code: 'dependency_warning_required',
        predecessors: predecessorPayload,
      },
    );
  }

  if (decision === 'override_reason_required') {
    throw new DomainRuleError(
      'A reason is required to override the dependency block',
      'tasks.errors.dependencyOverrideReasonRequired',
      {
        code: 'dependency_override_reason_required',
        predecessors: predecessorPayload,
      },
    );
  }

  if (decision === 'block') {
    throw new DomainRuleError(
      'Status change blocked by open task dependencies',
      'tasks.errors.dependencyBlocked',
      {
        code: 'dependency_blocked',
        predecessors: predecessorPayload,
      },
    );
  }

  return 'override';
}

/**
 * Canonical task status transition: lifecycle, dependency gate, completion stamps,
 * bucket sync, activity, followers, dependency-resolved notifications.
 */
export async function applyTaskStatusChange(
  context: OrgContext,
  taskId: string,
  newStatus: TaskStatus,
  actor: TaskStatusChangeActor,
  options: ApplyTaskStatusChangeOptions = {},
): Promise<Task> {
  const existing = await findTaskById(context.db, context.organizationId, taskId);
  if (!existing) throw new NotFoundError('Task');
  if (existing.isArchived) {
    throw new DomainRuleError('Cannot update an archived task', 'tasks.errors.taskIsArchived');
  }
  if (existing.status === newStatus) return existing;

  const gateOutcome = await assertDependencyGateAllowsStatusChange(
    context,
    taskId,
    newStatus,
    actor,
    options,
  );

  if (newStatus === 'done') {
    await assertTaskCompletionApprovalSatisfied(context, taskId);
  }
  if (!isValidTransition(existing.status, newStatus)) {
    throw new DomainRuleError(
      `Invalid status transition: ${existing.status} → ${newStatus}`,
      'tasks.errors.invalidTransition',
      { from: existing.status, to: newStatus },
    );
  }

  const { status, completionDate, clearCompletion } = transitionTask(existing.status, newStatus, {
    timeZone: context.organization.timezone,
  });

  const patch: Parameters<typeof updateTaskById>[3] = { status };
  if (completionDate) {
    patch.completionDate = completionDate;
    if (actor.kind === 'employee') {
      patch.completedByEmployeeId = actor.employeeId;
      patch.completedByOrgMemberId = null;
    } else if (actor.kind === 'member') {
      patch.completedByOrgMemberId = context.membershipId;
      patch.completedByEmployeeId = null;
    } else {
      patch.completedByOrgMemberId = null;
      patch.completedByEmployeeId = null;
    }
  }
  if (clearCompletion) {
    patch.completionDate = null;
    patch.completedByOrgMemberId = null;
    patch.completedByEmployeeId = null;
  }

  const bucketId = await bucketIdForStatus(context, existing.boardId, status);
  if (bucketId !== undefined && bucketId !== existing.bucketId) {
    patch.bucketId = bucketId;
  }

  const updated = await updateTaskById(context.db, context.organizationId, taskId, patch);
  if (!updated) throw new NotFoundError('Task');

  const eventType =
    status === 'done'
      ? 'completed'
      : existing.status === 'done' || existing.status === 'cancelled'
        ? 'reopened'
        : 'status_changed';

  const statusPayload: Record<string, unknown> = { from: existing.status, to: status };
  if (gateOutcome === 'override') {
    const reason = options.dependencyOverrideReason?.trim();
    statusPayload.dependencyOverride = true;
    statusPayload.dependencyOverrideReason = reason;
  }

  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...activityActorFields(context, actor),
    eventType,
    payload: statusPayload,
  });

  if (gateOutcome === 'override') {
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.TASK_DEPENDENCY_GATE_OVERRIDDEN,
      entityType: 'task',
      entityId: taskId,
      after: {
        from: existing.status,
        to: status,
        reason: options.dependencyOverrideReason?.trim(),
      },
    });
  }

  void notifyTaskFollowersOfStatusChange(context, {
    taskId,
    taskTitle: updated.title,
    newStatus: updated.status,
  }).catch(() => undefined);

  if (status === 'done') {
    await notifySuccessorsWhenDependenciesResolved(context, taskId);
  }

  return updated;
}
