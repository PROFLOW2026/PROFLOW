import { DomainRuleError } from '@/shared/errors';
import type { SafetyActionStatus, SafetyRecordStatus } from './types';

const RECORD_TRANSITIONS: Readonly<Record<SafetyRecordStatus, readonly SafetyRecordStatus[]>> = {
  open: ['in_progress', 'closed', 'cancelled'],
  in_progress: ['open', 'closed', 'cancelled'],
  closed: ['open'],
  cancelled: [],
};

const ACTION_TRANSITIONS: Readonly<Record<SafetyActionStatus, readonly SafetyActionStatus[]>> = {
  open: ['in_progress', 'done', 'cancelled'],
  in_progress: ['open', 'done', 'cancelled'],
  done: ['open'],
  cancelled: [],
};

export function canTransitionSafetyRecordStatus(
  from: SafetyRecordStatus,
  to: SafetyRecordStatus,
): boolean {
  if (from === to) return true;
  return RECORD_TRANSITIONS[from].includes(to);
}

export function assertSafetyRecordStatusTransition(
  from: SafetyRecordStatus,
  to: SafetyRecordStatus,
): void {
  if (!canTransitionSafetyRecordStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition safety record from ${from} to ${to}`,
      'safety.errors.invalidRecordTransition',
    );
  }
}

export function canTransitionSafetyActionStatus(
  from: SafetyActionStatus,
  to: SafetyActionStatus,
): boolean {
  if (from === to) return true;
  return ACTION_TRANSITIONS[from].includes(to);
}

export function assertSafetyActionStatusTransition(
  from: SafetyActionStatus,
  to: SafetyActionStatus,
): void {
  if (!canTransitionSafetyActionStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition corrective action from ${from} to ${to}`,
      'safety.errors.invalidActionTransition',
    );
  }
}

export function isOpenSafetyRecordStatus(status: SafetyRecordStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

export function isOpenSafetyActionStatus(status: SafetyActionStatus): boolean {
  return status === 'open' || status === 'in_progress';
}

export function closedAtForSafetyRecordStatus(
  status: SafetyRecordStatus,
  now: Date = new Date(),
): Date | null {
  return status === 'closed' || status === 'cancelled' ? now : null;
}

export function closedAtForSafetyActionStatus(
  status: SafetyActionStatus,
  now: Date = new Date(),
): Date | null {
  return status === 'done' || status === 'cancelled' ? now : null;
}
