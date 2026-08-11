import { DomainRuleError } from '@/shared/errors';
import type { DraftStatus } from './types';

export function assertDraftGeneratable(status: DraftStatus): void {
  if (status === 'paused') {
    throw new DomainRuleError(
      'Paused templates cannot generate drafts',
      'recurringDrafts.errors.notActive',
    );
  }
  if (status === 'ended') {
    throw new DomainRuleError(
      'Ended templates cannot generate drafts',
      'recurringDrafts.errors.ended',
    );
  }
}

export function assertDraftPausable(status: DraftStatus): void {
  if (status !== 'active') {
    throw new DomainRuleError(
      'Only active templates can be paused',
      'recurringDrafts.errors.notPausable',
    );
  }
}

export function assertDraftResumable(status: DraftStatus): void {
  if (status !== 'paused') {
    throw new DomainRuleError(
      'Only paused templates can be resumed',
      'recurringDrafts.errors.notResumable',
    );
  }
}

export function assertDraftEndable(status: DraftStatus): void {
  if (status === 'ended') {
    throw new DomainRuleError(
      'Template is already ended',
      'recurringDrafts.errors.alreadyEnded',
    );
  }
}

export function assertDraftEditable(status: DraftStatus): void {
  if (status === 'ended') {
    throw new DomainRuleError(
      'Ended templates cannot be edited',
      'recurringDrafts.errors.notEditable',
    );
  }
}
