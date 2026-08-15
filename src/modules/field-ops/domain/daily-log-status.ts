import { DomainRuleError } from '@/shared/errors';
import type { DailyLogStatus } from './types';

const TRANSITIONS: Readonly<Record<DailyLogStatus, readonly DailyLogStatus[]>> = {
  draft: ['submitted', 'finalized'],
  submitted: ['finalized'],
  finalized: [],
};

export function isDailyLogLocked(status: DailyLogStatus): boolean {
  return status === 'finalized';
}

export function canTransitionDailyLogStatus(from: DailyLogStatus, to: DailyLogStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertDailyLogStatusTransition(from: DailyLogStatus, to: DailyLogStatus): void {
  if (!canTransitionDailyLogStatus(from, to)) {
    throw new DomainRuleError(
      `Cannot transition daily log from ${from} to ${to}`,
      'fieldOps.errors.invalidLogTransition',
    );
  }
}

export function assertDailyLogContentMutable(status: DailyLogStatus): void {
  if (isDailyLogLocked(status)) {
    throw new DomainRuleError(
      'Finalized daily log is locked; add a correction note or a new log',
      'fieldOps.errors.logFinalizedLocked',
    );
  }
}

export function submittedStamp(
  status: DailyLogStatus,
  existing: { submittedAt: Date | null; submittedByUserId: string | null },
  userId: string,
  now: Date = new Date(),
): { submittedAt?: Date; submittedByUserId?: string } {
  if (status !== 'submitted' && status !== 'finalized') return {};
  if (existing.submittedAt) return {};
  return { submittedAt: now, submittedByUserId: userId };
}

export function finalizedStamp(
  status: DailyLogStatus,
  existingFinalizedAt: Date | null,
  now: Date = new Date(),
): { finalizedAt?: Date } {
  if (status !== 'finalized') return {};
  if (existingFinalizedAt) return {};
  return { finalizedAt: now };
}
