export const RESET_STATUSES = ['pending', 'running', 'failed', 'completed'] as const;
export type ResetStatus = (typeof RESET_STATUSES)[number];

export type ResetDecision = 'create' | 'resume' | 'exit' | 'skip';

export function decideResetAction(input: {
  readonly existing: { readonly status: ResetStatus; readonly leaseUntil: Date | null } | null;
  readonly now: Date;
  readonly resetHour: boolean;
}): ResetDecision {
  if (!input.existing) {
    return input.resetHour ? 'create' : 'skip';
  }
  if (input.existing.status === 'completed') return 'exit';
  if (input.existing.status === 'running') {
    if (input.existing.leaseUntil && input.existing.leaseUntil.getTime() > input.now.getTime()) {
      return 'exit';
    }
    return 'resume';
  }
  if (input.existing.status === 'failed' || input.existing.status === 'pending') return 'resume';
  return 'skip';
}

/** A run is complete only when every phase item is completed. Zero session orgs is not enough. */
export function resetRunIsComplete(itemStatuses: readonly ResetStatus[]): boolean {
  return itemStatuses.length > 0 && itemStatuses.every((status) => status === 'completed');
}
