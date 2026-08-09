import type { ChangeRequestStatus } from './types';

/**
 * V1 change request lifecycle (doc 05 §5, decision U7/C2).
 *
 * "Sent" is an event (`sentAt`), not a status. Billing and payment are out of scope.
 */

const TERMINAL_STATUSES: ReadonlySet<ChangeRequestStatus> = new Set([
  'approved',
  'rejected',
  'cancelled',
]);

const TRANSITIONS: Readonly<Record<ChangeRequestStatus, readonly ChangeRequestStatus[]>> = {
  draft: ['awaiting_approval', 'cancelled'],
  awaiting_approval: ['approved', 'rejected', 'cancelled'],
  approved: [],
  rejected: [],
  cancelled: [],
};

export function isTerminalChangeRequestStatus(status: ChangeRequestStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function canTransitionChangeRequest(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertChangeRequestTransition(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
): void {
  if (!canTransitionChangeRequest(from, to)) {
    throw new Error(`Invalid change request transition: ${from} → ${to}`);
  }
}

export const PENDING_CHANGE_STATUSES: readonly ChangeRequestStatus[] = [
  'draft',
  'awaiting_approval',
];

export function isPendingChangeStatus(status: ChangeRequestStatus): boolean {
  return (PENDING_CHANGE_STATUSES as readonly string[]).includes(status);
}
