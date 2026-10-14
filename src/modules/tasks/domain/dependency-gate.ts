import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { TaskDependencyPolicy } from './dependency-policy';
import type { TaskStatus } from './types';

export interface DependencyPredecessorSummary {
  readonly taskId: string;
  readonly title: string;
  readonly status: TaskStatus;
}

export type DependencyGateDecision =
  | 'allow'
  | 'warn'
  | 'block'
  | 'override'
  | 'override_reason_required';

export interface DependencyGateInput {
  readonly policy: TaskDependencyPolicy;
  readonly targetStatus: TaskStatus;
  readonly openPredecessors: readonly DependencyPredecessorSummary[];
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly confirmDependencyWarning: boolean;
  readonly dependencyOverrideReason?: string | null;
  readonly actorIsSystem: boolean;
}

const GATED_TARGET_STATUSES: ReadonlySet<TaskStatus> = new Set(['in_progress', 'done']);

export function statusTransitionRequiresDependencyGate(targetStatus: TaskStatus): boolean {
  return GATED_TARGET_STATUSES.has(targetStatus);
}

/**
 * Evaluates org dependency policy for a status transition with open predecessors.
 */
export function evaluateDependencyGate(input: DependencyGateInput): DependencyGateDecision {
  if (input.actorIsSystem) return 'allow';
  if (!statusTransitionRequiresDependencyGate(input.targetStatus)) return 'allow';
  if (input.openPredecessors.length === 0) return 'allow';

  if (input.policy === 'warn') {
    return input.confirmDependencyWarning ? 'allow' : 'warn';
  }

  const canOverride = input.permissions.has(PERMISSIONS.TASKS_MANAGE_ALL);
  if (!canOverride) return 'block';

  const reason = input.dependencyOverrideReason?.trim();
  if (!reason) return 'override_reason_required';

  return 'override';
}
