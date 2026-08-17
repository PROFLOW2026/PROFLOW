/**
 * Close / reopen / job-skip rules. Framework-free.
 */

import { DomainRuleError } from '@/shared/errors';
import { hasHardBlockers } from './readiness';
import type { CloseoutStatus, ReadinessItem } from './types';

export const CLOSEOUT_ERROR_JOBS_USE_COMPLETE = 'closeout.errors.jobsUseComplete';
export const CLOSEOUT_ERROR_USE_CLOSEOUT = 'closeout.errors.useCloseout';
export const CLOSEOUT_ERROR_USE_REOPEN = 'closeout.errors.useReopen';
export const CLOSEOUT_ERROR_NOT_CLOSEABLE = 'closeout.errors.notCloseable';
export const CLOSEOUT_ERROR_ALREADY_CLOSED = 'closeout.errors.alreadyClosed';
export const CLOSEOUT_ERROR_NOT_CLOSED = 'closeout.errors.notClosed';
export const CLOSEOUT_ERROR_REASON_REQUIRED = 'closeout.errors.reasonRequired';

export function isCloseoutEligibleWorkKind(workKind: string): boolean {
  return workKind === 'project';
}

export function assertCloseoutEligibleWorkKind(workKind: string): void {
  if (!isCloseoutEligibleWorkKind(workKind)) {
    throw new DomainRuleError(
      'Jobs and service calls complete without project closeout',
      CLOSEOUT_ERROR_JOBS_USE_COMPLETE,
    );
  }
}

/**
 * Classic projects (`work_kind=project`) must close via the closeout action,
 * not the generic status dropdown.
 */
export function shouldInterceptStatusComplete(input: {
  readonly workKind: string;
  readonly existingStatus: string;
  readonly nextStatus: string | undefined;
}): boolean {
  if (input.nextStatus !== 'completed') return false;
  if (input.existingStatus === 'completed') return false;
  return isCloseoutEligibleWorkKind(input.workKind);
}

export function shouldInterceptStatusReopen(input: {
  readonly workKind: string;
  readonly existingStatus: string;
  readonly nextStatus: string | undefined;
}): boolean {
  if (!isCloseoutEligibleWorkKind(input.workKind)) return false;
  if (input.existingStatus !== 'completed') return false;
  if (!input.nextStatus || input.nextStatus === 'completed') return false;
  return true;
}

export function assertClassicProjectUsesCloseout(input: {
  readonly workKind: string;
  readonly existingStatus: string;
  readonly nextStatus: string | undefined;
}): void {
  if (shouldInterceptStatusComplete(input)) {
    throw new DomainRuleError(
      'Classic projects close through closeout, not the status field',
      CLOSEOUT_ERROR_USE_CLOSEOUT,
    );
  }
  if (shouldInterceptStatusReopen(input)) {
    throw new DomainRuleError(
      'Classic projects reopen through closeout, not the status field',
      CLOSEOUT_ERROR_USE_REOPEN,
    );
  }
}

export function assertReasonRequired(reason: string | null | undefined): string {
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    throw new DomainRuleError('A reason is required', CLOSEOUT_ERROR_REASON_REQUIRED);
  }
  return trimmed;
}

export function assertCanClose(input: {
  readonly workKind: string;
  readonly projectStatus: string;
  readonly closeoutStatus: CloseoutStatus | null;
  readonly items: readonly ReadinessItem[];
}): void {
  assertCloseoutEligibleWorkKind(input.workKind);
  if (input.projectStatus === 'completed' || input.closeoutStatus === 'closed') {
    throw new DomainRuleError('This project is already closed', CLOSEOUT_ERROR_ALREADY_CLOSED);
  }
  if (hasHardBlockers(input.items)) {
    throw new DomainRuleError('This project cannot be closed yet', CLOSEOUT_ERROR_NOT_CLOSEABLE);
  }
}

export function assertCanMarkReady(input: {
  readonly workKind: string;
  readonly projectStatus: string;
  readonly closeoutStatus: CloseoutStatus | null;
  readonly items: readonly ReadinessItem[];
}): void {
  assertCloseoutEligibleWorkKind(input.workKind);
  if (input.projectStatus === 'completed' || input.closeoutStatus === 'closed') {
    throw new DomainRuleError('This project is already closed', CLOSEOUT_ERROR_ALREADY_CLOSED);
  }
  if (hasHardBlockers(input.items)) {
    throw new DomainRuleError('This project cannot be closed yet', CLOSEOUT_ERROR_NOT_CLOSEABLE);
  }
}

export function assertCanReopen(input: {
  readonly projectStatus: string;
  readonly closeoutStatus: CloseoutStatus | null;
}): void {
  const closed =
    input.projectStatus === 'completed' || input.closeoutStatus === 'closed';
  if (!closed) {
    throw new DomainRuleError('This project is not closed', CLOSEOUT_ERROR_NOT_CLOSED);
  }
}
