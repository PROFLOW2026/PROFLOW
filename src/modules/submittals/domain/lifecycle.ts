import { DomainRuleError } from '@/shared/errors/app-error';
import {
  SUBMITTAL_CONTRACTOR_ACTION_STATUSES,
  SUBMITTAL_PENDING_STATUSES,
  type SubmittalAction,
  type SubmittalActorType,
  type SubmittalReviewDecision,
  type SubmittalStatus,
} from './types';

/**
 * Submittal lifecycle. Every submission is an immutable revision; a review decision closes that revision.
 * revise_and_resubmit / rejected -> `open_revision` starts Rev N+1 as a draft. Mirrors
 * `app.submittals_guard_update` (0163).
 */
const FROM: Readonly<Record<SubmittalAction, Readonly<Record<SubmittalActorType, readonly SubmittalStatus[]>>>> = {
  submit: { internal: ['draft'], external: ['draft'] },
  start_review: { internal: ['submitted'], external: [] },
  review: { internal: ['submitted', 'under_review'], external: [] },
  open_revision: { internal: ['revise_and_resubmit', 'rejected'], external: ['revise_and_resubmit', 'rejected'] },
  withdraw: { internal: ['draft', 'submitted', 'under_review'], external: ['draft', 'submitted'] },
};

export function canSubmittalTransition(
  status: SubmittalStatus,
  action: SubmittalAction,
  actor: SubmittalActorType = 'internal',
): boolean {
  return FROM[action][actor].includes(status);
}

export function nextSubmittalStatus(
  status: SubmittalStatus,
  action: SubmittalAction,
  actor: SubmittalActorType = 'internal',
  decision?: SubmittalReviewDecision,
): SubmittalStatus {
  if (!canSubmittalTransition(status, action, actor)) {
    throw new DomainRuleError(
      `Submittal cannot ${action} from ${status}`,
      'submittals.errors.invalidTransition',
      { status, action },
    );
  }
  switch (action) {
    case 'submit':
      return 'submitted';
    case 'start_review':
      return 'under_review';
    case 'review':
      if (!decision) {
        throw new DomainRuleError('Review needs a decision', 'submittals.errors.decisionRequired');
      }
      return decision;
    case 'open_revision':
      return 'draft';
    case 'withdraw':
      return 'withdrawn';
  }
}

export function availableSubmittalActions(
  status: SubmittalStatus,
  actor: SubmittalActorType = 'internal',
): SubmittalAction[] {
  return (Object.keys(FROM) as SubmittalAction[]).filter((action) => canSubmittalTransition(status, action, actor));
}

/** Every decision except a clean approval must explain itself to the contractor. */
export function reviewRequiresComments(decision: SubmittalReviewDecision): boolean {
  return decision !== 'approved';
}

export function isSubmittalPending(status: SubmittalStatus): boolean {
  return SUBMITTAL_PENDING_STATUSES.includes(status);
}

export function submittalNeedsContractorAction(status: SubmittalStatus): boolean {
  return SUBMITTAL_CONTRACTOR_ACTION_STATUSES.includes(status);
}

export function isSubmittalApproved(status: SubmittalStatus): boolean {
  return status === 'approved' || status === 'approved_with_comments';
}

/** Review overdue: pending review past the required-by date. `today` = org-local YYYY-MM-DD. */
export function isSubmittalOverdue(
  submittal: { status: SubmittalStatus; dueDate: string | null },
  today: string,
): boolean {
  return isSubmittalPending(submittal.status) && submittal.dueDate !== null && submittal.dueDate < today;
}

export function submittalDaysOverdue(
  submittal: { status: SubmittalStatus; dueDate: string | null },
  today: string,
): number {
  if (!isSubmittalOverdue(submittal, today)) return 0;
  const due = Date.parse(`${submittal.dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

/** Only a draft revision accepts notes/attachments; submitted revisions are frozen. */
export function isRevisionEditable(revision: { submittedAt: Date | string | null }): boolean {
  return revision.submittedAt === null;
}

export function formatSubmittalNumber(number: number): string {
  return `SUB-${String(number).padStart(3, '0')}`;
}

export type SubmittalTone = 'neutral' | 'info' | 'pending' | 'warning' | 'success' | 'danger';

export function submittalStatusTone(status: SubmittalStatus, overdue = false): SubmittalTone {
  if (overdue) return 'danger';
  switch (status) {
    case 'draft':
    case 'withdrawn':
      return 'neutral';
    case 'submitted':
      return 'pending';
    case 'under_review':
      return 'info';
    case 'approved':
      return 'success';
    case 'approved_with_comments':
      return 'success';
    case 'revise_and_resubmit':
      return 'warning';
    case 'rejected':
      return 'danger';
  }
}
