import { isOpenSafetyActionStatus } from './status';
import type { SafetyActionStatus } from './types';

/** Minimal shape the notifications scanner (and UI summary) can pass in. */
export interface SafetyActionOverdueInput {
  readonly organizationId: string;
  readonly status: SafetyActionStatus;
  readonly dueDate: string | null;
}

export function isCorrectiveActionOverdue(
  action: SafetyActionOverdueInput,
  today: string,
): boolean {
  if (!isOpenSafetyActionStatus(action.status)) return false;
  if (!action.dueDate) return false;
  return action.dueDate < today;
}

/**
 * Domain helper for the notifications scanner: filter already-loaded actions
 * to those that are overdue, optionally scoped to one organization.
 */
export function listOverdueSafetyActions<T extends SafetyActionOverdueInput>(
  actions: readonly T[],
  today: string,
  organizationId?: string,
): T[] {
  return actions.filter((action) => {
    if (organizationId && action.organizationId !== organizationId) return false;
    return isCorrectiveActionOverdue(action, today);
  });
}

export function belongsToOrganization<T extends { organizationId: string }>(
  row: T,
  organizationId: string,
): boolean {
  return row.organizationId === organizationId;
}
