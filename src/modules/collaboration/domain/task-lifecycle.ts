import { DomainRuleError } from '@/shared/errors';

/**
 * External (contractor) task lifecycle - pure rules. The task row stays in the EXISTING task
 * engine; this lifecycle lives in `task_external_assignments` and every step is appended to
 * `task_external_events`.
 *
 * assigned -> acknowledged -> in_progress -> completion_submitted -> verification
 *   approved | approved_with_remarks -> approved -> closed
 *   rejected | rework_required       -> reopened (cycle + 1) -> in_progress? -> resubmitted -> ...
 */

export const EXTERNAL_TASK_STATUSES = [
  'assigned',
  'acknowledged',
  'in_progress',
  'completion_submitted',
  'resubmitted',
  'approved',
  'rejected',
  'rework_required',
  'reopened',
  'closed',
  'cancelled',
] as const;
export type ExternalTaskStatus = (typeof EXTERNAL_TASK_STATUSES)[number];

export const VERIFICATION_OUTCOMES = ['approved', 'approved_with_remarks', 'rejected', 'rework_required'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

export const QUALITY_ASSESSMENTS = ['satisfactory', 'needs_attention', 'unacceptable'] as const;
export type QualityAssessment = (typeof QUALITY_ASSESSMENTS)[number];

export type LifecycleActor = 'internal' | 'external';

export type ExternalTaskCommand =
  | { readonly type: 'acknowledge' }
  | { readonly type: 'start' }
  | {
      readonly type: 'submit_completion';
      /** Evidence attached to the task now; null when not counted (evidence not required). */
      readonly evidenceCount: number | null;
      readonly note?: string | null;
    }
  | {
      readonly type: 'verify';
      readonly outcome: VerificationOutcome;
      readonly quality?: QualityAssessment | null;
      readonly note?: string | null;
    }
  | { readonly type: 'reopen'; readonly note?: string | null }
  | { readonly type: 'close'; readonly quality?: QualityAssessment | null; readonly note?: string | null }
  | { readonly type: 'cancel'; readonly note?: string | null };

export type ExternalTaskCommandType = ExternalTaskCommand['type'];

export type ExternalTaskEventAction =
  | 'assigned'
  | 'reassigned'
  | 'acknowledged'
  | 'started'
  | 'completion_submitted'
  | 'verified'
  | 'reopened'
  | 'closed'
  | 'cancelled';

export interface ExternalTaskState {
  readonly status: ExternalTaskStatus;
  readonly cycle: number;
  readonly requiresEvidence: boolean;
  /** Evidence count recorded at the previous submission (resubmission must add new evidence). */
  readonly lastSubmittedEvidenceCount: number | null;
}

export interface ExternalTaskTransition {
  readonly action: ExternalTaskEventAction;
  readonly from: ExternalTaskStatus;
  readonly to: ExternalTaskStatus;
  readonly cycle: number;
  readonly outcome: VerificationOutcome | null;
  readonly quality: QualityAssessment | null;
  readonly evidenceCount: number | null;
  readonly note: string | null;
}

const TERMINAL: ReadonlySet<ExternalTaskStatus> = new Set(['closed', 'cancelled']);
const AWAITING_VERIFICATION: ReadonlySet<ExternalTaskStatus> = new Set(['completion_submitted', 'resubmitted']);
const NEGATIVE_OUTCOMES: ReadonlySet<VerificationOutcome> = new Set(['rejected', 'rework_required']);

export const NOTE_MAX_LENGTH = 4000;

export function isExternalTaskStatus(value: unknown): value is ExternalTaskStatus {
  return typeof value === 'string' && (EXTERNAL_TASK_STATUSES as readonly string[]).includes(value);
}

export function isVerificationOutcome(value: unknown): value is VerificationOutcome {
  return typeof value === 'string' && (VERIFICATION_OUTCOMES as readonly string[]).includes(value);
}

export function isQualityAssessment(value: unknown): value is QualityAssessment {
  return typeof value === 'string' && (QUALITY_ASSESSMENTS as readonly string[]).includes(value);
}

export function isTerminalExternalStatus(status: ExternalTaskStatus): boolean {
  return TERMINAL.has(status);
}

function invalid(state: ExternalTaskState, command: ExternalTaskCommandType): never {
  throw new DomainRuleError(
    `Task cannot ${command} from status ${state.status}`,
    'collaboration.errors.invalidTransition',
    { from: state.status, command },
  );
}

function actorOnly(actor: LifecycleActor, allowed: LifecycleActor, command: ExternalTaskCommandType): void {
  if (actor !== allowed) {
    throw new DomainRuleError(
      `Only ${allowed} actors can ${command}`,
      'collaboration.errors.actorNotAllowed',
      { command, actor },
    );
  }
}

function normaliseNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.length > NOTE_MAX_LENGTH) {
    throw new DomainRuleError('Note is too long', 'collaboration.errors.noteTooLong');
  }
  return trimmed;
}

function base(
  state: ExternalTaskState,
  action: ExternalTaskEventAction,
  to: ExternalTaskStatus,
  extra: Partial<ExternalTaskTransition> = {},
): ExternalTaskTransition {
  return {
    action,
    from: state.status,
    to,
    cycle: state.cycle,
    outcome: null,
    quality: null,
    evidenceCount: null,
    note: null,
    ...extra,
  };
}

/** Plans a lifecycle step or throws a DomainRuleError (no I/O). */
export function planExternalTaskTransition(
  state: ExternalTaskState,
  command: ExternalTaskCommand,
  actor: LifecycleActor,
): ExternalTaskTransition {
  switch (command.type) {
    case 'acknowledge': {
      actorOnly(actor, 'external', command.type);
      if (state.status !== 'assigned') invalid(state, command.type);
      return base(state, 'acknowledged', 'acknowledged');
    }
    case 'start': {
      actorOnly(actor, 'external', command.type);
      if (state.status !== 'acknowledged' && state.status !== 'reopened') invalid(state, command.type);
      return base(state, 'started', 'in_progress');
    }
    case 'submit_completion': {
      actorOnly(actor, 'external', command.type);
      if (state.status !== 'in_progress' && state.status !== 'reopened') invalid(state, command.type);
      const evidenceCount =
        command.evidenceCount == null ? null : Math.max(0, Math.trunc(command.evidenceCount));
      if (state.requiresEvidence) {
        if (evidenceCount === null || evidenceCount < 1) {
          throw new DomainRuleError('Completion requires evidence', 'collaboration.errors.evidenceRequired');
        }
        if (state.cycle > 1 && evidenceCount <= (state.lastSubmittedEvidenceCount ?? 0)) {
          throw new DomainRuleError(
            'Resubmission requires new evidence',
            'collaboration.errors.newEvidenceRequired',
          );
        }
      }
      return base(state, 'completion_submitted', state.cycle > 1 ? 'resubmitted' : 'completion_submitted', {
        evidenceCount,
        note: normaliseNote(command.note),
      });
    }
    case 'verify': {
      actorOnly(actor, 'internal', command.type);
      if (!AWAITING_VERIFICATION.has(state.status)) invalid(state, command.type);
      if (!isVerificationOutcome(command.outcome)) {
        throw new DomainRuleError('Unknown verification outcome', 'collaboration.errors.invalidOutcome');
      }
      if (command.quality != null && !isQualityAssessment(command.quality)) {
        throw new DomainRuleError('Unknown quality assessment', 'collaboration.errors.invalidQuality');
      }
      const note = normaliseNote(command.note);
      if (command.outcome !== 'approved' && !note) {
        throw new DomainRuleError(
          'A remark is required for this verification outcome',
          'collaboration.errors.remarkRequired',
        );
      }
      const to: ExternalTaskStatus = NEGATIVE_OUTCOMES.has(command.outcome)
        ? (command.outcome as 'rejected' | 'rework_required')
        : 'approved';
      return base(state, 'verified', to, { outcome: command.outcome, quality: command.quality ?? null, note });
    }
    case 'reopen': {
      const negative = state.status === 'rejected' || state.status === 'rework_required';
      const internalOnly = state.status === 'approved' || state.status === 'closed';
      if (!negative && !internalOnly) invalid(state, command.type);
      if (internalOnly) actorOnly(actor, 'internal', command.type);
      const note = normaliseNote(command.note);
      if (internalOnly && !note) {
        throw new DomainRuleError('A reason is required to reopen', 'collaboration.errors.reasonRequired');
      }
      return { ...base(state, 'reopened', 'reopened', { note }), cycle: state.cycle + 1 };
    }
    case 'close': {
      actorOnly(actor, 'internal', command.type);
      if (state.status !== 'approved') invalid(state, command.type);
      if (command.quality != null && !isQualityAssessment(command.quality)) {
        throw new DomainRuleError('Unknown quality assessment', 'collaboration.errors.invalidQuality');
      }
      return base(state, 'closed', 'closed', { quality: command.quality ?? null, note: normaliseNote(command.note) });
    }
    case 'cancel': {
      actorOnly(actor, 'internal', command.type);
      if (TERMINAL.has(state.status)) invalid(state, command.type);
      const note = normaliseNote(command.note);
      if (!note) throw new DomainRuleError('A reason is required to cancel', 'collaboration.errors.reasonRequired');
      return base(state, 'cancelled', 'cancelled', { note });
    }
  }
}

/** Commands the actor may issue in the current state (drives buttons; the server re-checks). */
export function availableExternalTaskCommands(
  state: Pick<ExternalTaskState, 'status'>,
  actor: LifecycleActor,
): readonly ExternalTaskCommandType[] {
  const s = state.status;
  if (actor === 'external') {
    if (s === 'assigned') return ['acknowledge'];
    if (s === 'acknowledged') return ['start'];
    if (s === 'in_progress') return ['submit_completion'];
    if (s === 'reopened') return ['start', 'submit_completion'];
    if (s === 'rejected' || s === 'rework_required') return ['reopen'];
    return [];
  }
  const commands: ExternalTaskCommandType[] = [];
  if (AWAITING_VERIFICATION.has(s)) commands.push('verify');
  if (s === 'approved') commands.push('close');
  if (s === 'rejected' || s === 'rework_required' || s === 'approved' || s === 'closed') commands.push('reopen');
  if (!TERMINAL.has(s)) commands.push('cancel');
  return commands;
}

/** Columns to stamp on the extension row for a planned transition. */
export function transitionTimestamps(
  transition: ExternalTaskTransition,
  now: Date,
): Partial<Record<'acknowledgedAt' | 'startedAt' | 'submittedAt' | 'verifiedAt' | 'closedAt', Date | null>> {
  switch (transition.action) {
    case 'acknowledged':
      return { acknowledgedAt: now };
    case 'started':
      return { startedAt: now };
    case 'completion_submitted':
      return { submittedAt: now };
    case 'verified':
      return { verifiedAt: now };
    case 'closed':
      return { closedAt: now };
    case 'reopened':
      return { closedAt: null };
    default:
      return {};
  }
}
