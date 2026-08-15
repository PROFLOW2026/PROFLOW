import type { ContractStatus } from './types';

/**
 * Live commercial statuses that can still receive changes / billing targeting.
 * Closed and cancelled stay on the project for history but are not editable
 * into a new commercial life without an explicit reopen (not offered in V1).
 */
const TERMINAL_STATUSES: ReadonlySet<ContractStatus> = new Set(['closed', 'cancelled']);

const TRANSITIONS: Readonly<Record<ContractStatus, readonly ContractStatus[]>> = {
  draft: ['active', 'cancelled'],
  active: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

export function isTerminalContractStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status as ContractStatus);
}

export function canTransitionContractStatus(from: string, to: string): boolean {
  if (from === to) return true;
  const allowed = TRANSITIONS[from as ContractStatus];
  if (!allowed) return false;
  return allowed.includes(to as ContractStatus);
}

export function contractStatusActions(status: string): readonly ('active' | 'closed' | 'cancelled')[] {
  if (status === 'draft') return ['active', 'cancelled'];
  if (status === 'active') return ['closed', 'cancelled'];
  return [];
}
