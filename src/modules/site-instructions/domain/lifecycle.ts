import type {
  SiteInstructionCategory,
  SiteInstructionConversionState,
  SiteInstructionEventType,
  SiteInstructionStatus,
} from '@drizzle/schema';

/**
 * Site instruction lifecycle (pure mirror of `app.site_instruction_apply_event`).
 *
 * issued -> acknowledged -> performed -> closed; cancel before performance; reopen after
 * performance (back to acknowledged). Contractors may only acknowledge or report performed.
 */

export type { SiteInstructionCategory, SiteInstructionConversionState, SiteInstructionEventType, SiteInstructionStatus };

export type InstructionActorKind = 'internal' | 'external';

export interface InstructionState {
  readonly status: SiteInstructionStatus;
  readonly category: SiteInstructionCategory;
  readonly conversionState: SiteInstructionConversionState;
}

export type TransitionEvent = Exclude<SiteInstructionEventType, 'issued' | 'note'>;

const STATUS_TRANSITIONS: Readonly<Record<string, { readonly from: readonly SiteInstructionStatus[]; readonly to: SiteInstructionStatus }>> = {
  acknowledged: { from: ['issued'], to: 'acknowledged' },
  performed: { from: ['issued', 'acknowledged'], to: 'performed' },
  closed: { from: ['acknowledged', 'performed'], to: 'closed' },
  cancelled: { from: ['issued', 'acknowledged'], to: 'cancelled' },
  reopened: { from: ['performed', 'closed'], to: 'acknowledged' },
};

const EXTERNAL_EVENTS: ReadonlySet<SiteInstructionEventType> = new Set(['acknowledged', 'performed', 'note']);

export function isFinancialCategory(category: SiteInstructionCategory): boolean {
  return category !== 'operational';
}

export function initialConversionState(category: SiteInstructionCategory): SiteInstructionConversionState {
  return isFinancialCategory(category) ? 'pending' : 'none';
}

/** null = allowed; otherwise a stable reason key (siteOps.errors.*). */
export function transitionBlocker(
  state: InstructionState,
  event: TransitionEvent,
  actor: InstructionActorKind,
): string | null {
  if (actor === 'external' && !EXTERNAL_EVENTS.has(event)) return 'notAllowedForContractor';
  const statusRule = STATUS_TRANSITIONS[event];
  if (statusRule) return statusRule.from.includes(state.status) ? null : 'invalidTransition';
  switch (event) {
    case 'conversion_requested':
      if (!isFinancialCategory(state.category) || state.status === 'cancelled') return 'conversionNotAllowed';
      return state.conversionState === 'converted' ? 'alreadyConverted' : null;
    case 'converted':
      return !isFinancialCategory(state.category) || state.status === 'cancelled' ? 'conversionNotAllowed' : null;
    case 'conversion_dismissed':
      return state.conversionState === 'pending' ? null : 'nothingToDismiss';
    default:
      return 'invalidTransition';
  }
}

export function nextState(state: InstructionState, event: TransitionEvent): InstructionState {
  const statusRule = STATUS_TRANSITIONS[event];
  if (statusRule) return { ...state, status: statusRule.to };
  if (event === 'conversion_requested') return { ...state, conversionState: 'pending' };
  if (event === 'converted') return { ...state, conversionState: 'converted' };
  if (event === 'conversion_dismissed') return { ...state, conversionState: 'dismissed' };
  return state;
}

/** Transitions available to an actor from the current state (drives the action buttons). */
export function availableTransitions(state: InstructionState, actor: InstructionActorKind): TransitionEvent[] {
  const all: TransitionEvent[] = [
    'acknowledged',
    'performed',
    'closed',
    'cancelled',
    'reopened',
    'conversion_requested',
    'converted',
    'conversion_dismissed',
  ];
  return all.filter((event) => transitionBlocker(state, event, actor) === null);
}

export function isAwaitingAcknowledgement(status: SiteInstructionStatus): boolean {
  return status === 'issued';
}

export function isOpenInstruction(status: SiteInstructionStatus): boolean {
  return status === 'issued' || status === 'acknowledged' || status === 'performed';
}

/** Overdue = still open and the due date is before today (YYYY-MM-DD compare). */
export function isInstructionOverdue(status: SiteInstructionStatus, dueDate: string | null, today: string): boolean {
  return dueDate !== null && dueDate < today && (status === 'issued' || status === 'acknowledged');
}
