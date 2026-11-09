import { DomainRuleError } from '@/shared/errors';
import type { WorkPermitStatus } from './types';

const TRANSITIONS: Readonly<Record<WorkPermitStatus, readonly WorkPermitStatus[]>> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['closed'],
  rejected: [],
  closed: [],
};

export function canTransitionWorkPermitStatus(from: WorkPermitStatus, to: WorkPermitStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertWorkPermitStatusTransition(from: WorkPermitStatus, to: WorkPermitStatus): void {
  if (!canTransitionWorkPermitStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition work permit from ${from} to ${to}`,
      'workPermits.errors.invalidTransition',
    );
  }
}
