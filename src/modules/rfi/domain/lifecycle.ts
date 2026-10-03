import { DomainRuleError } from '@/shared/errors/app-error';
import {
  RFI_AWAITING_ANSWER_STATUSES,
  type RfiAction,
  type RfiActorType,
  type RfiStatus,
} from './types';

/**
 * RFI lifecycle: draft -> submitted -> under_review -> answered -> closed, with an audited reopen
 * (answered | closed -> under_review, reason required). Mirrors `app.rfis_guard_update` (0163).
 */
const TRANSITIONS: Readonly<Record<RfiAction, { readonly from: readonly RfiStatus[]; readonly to: RfiStatus }>> = {
  submit: { from: ['draft'], to: 'submitted' },
  start_review: { from: ['submitted'], to: 'under_review' },
  answer: { from: ['submitted', 'under_review'], to: 'answered' },
  close: { from: ['submitted', 'under_review', 'answered'], to: 'closed' },
  reopen: { from: ['answered', 'closed'], to: 'under_review' },
};

/** Contractors may only submit their own drafts; everything else belongs to the project team. */
const EXTERNAL_ACTIONS: ReadonlySet<RfiAction> = new Set(['submit']);

export function canRfiTransition(status: RfiStatus, action: RfiAction, actor: RfiActorType = 'internal'): boolean {
  if (actor === 'external' && !EXTERNAL_ACTIONS.has(action)) return false;
  return TRANSITIONS[action].from.includes(status);
}

export function nextRfiStatus(status: RfiStatus, action: RfiAction, actor: RfiActorType = 'internal'): RfiStatus {
  if (!canRfiTransition(status, action, actor)) {
    throw new DomainRuleError(
      `RFI cannot ${action} from ${status}`,
      'rfi.errors.invalidTransition',
      { status, action },
    );
  }
  return TRANSITIONS[action].to;
}

export function availableRfiActions(status: RfiStatus, actor: RfiActorType = 'internal'): RfiAction[] {
  return (Object.keys(TRANSITIONS) as RfiAction[]).filter((action) => canRfiTransition(status, action, actor));
}

/** Closing without an official answer, and every reopen, must say why. */
export function rfiActionRequiresReason(status: RfiStatus, action: RfiAction): boolean {
  if (action === 'reopen') return true;
  if (action === 'close') return status !== 'answered';
  return false;
}

/** Subject / question / contractor are editable only while the RFI is a draft. */
export function isRfiContentEditable(status: RfiStatus): boolean {
  return status === 'draft';
}

/** Assignment, due date, priority, location, refs: editable by the team until closed. */
export function isRfiTriageEditable(status: RfiStatus): boolean {
  return status !== 'closed';
}

export function isRfiAwaitingAnswer(status: RfiStatus): boolean {
  return RFI_AWAITING_ANSWER_STATUSES.includes(status);
}

/** `today` is the organization-local date (YYYY-MM-DD). */
export function isRfiOverdue(rfi: { status: RfiStatus; dueDate: string | null }, today: string): boolean {
  return isRfiAwaitingAnswer(rfi.status) && rfi.dueDate !== null && rfi.dueDate < today;
}

export function rfiDaysOverdue(rfi: { status: RfiStatus; dueDate: string | null }, today: string): number {
  if (!isRfiOverdue(rfi, today)) return 0;
  const due = Date.parse(`${rfi.dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((now - due) / 86_400_000));
}

export function formatRfiNumber(number: number): string {
  return `RFI-${String(number).padStart(3, '0')}`;
}

export type RfiTone = 'neutral' | 'info' | 'pending' | 'warning' | 'success' | 'danger';

export function rfiStatusTone(status: RfiStatus, overdue = false): RfiTone {
  if (overdue) return 'danger';
  switch (status) {
    case 'draft':
      return 'neutral';
    case 'submitted':
      return 'pending';
    case 'under_review':
      return 'info';
    case 'answered':
      return 'success';
    case 'closed':
      return 'neutral';
  }
}
