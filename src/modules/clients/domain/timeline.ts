/**
 * Unified client timeline — projection over canonical records.
 * `activity_events` is a pointer index, never a second financial ledger.
 */

export const TIMELINE_CATEGORIES = [
  'client',
  'project',
  'work_order',
  'quote',
  'contract',
  'change',
  'milestone',
  'billing',
  'document',
  'approval',
  'correction',
] as const;

export type TimelineCategory = (typeof TIMELINE_CATEGORIES)[number];

export const TIMELINE_SORT_DIRECTIONS = ['newest', 'oldest'] as const;
export type TimelineSortDirection = (typeof TIMELINE_SORT_DIRECTIONS)[number];

export const TIMELINE_PRESENTATIONS = [
  'active',
  'void',
  'draft',
  'approved',
  'pending',
  'cancelled',
  'neutral',
] as const;

export type TimelinePresentation = (typeof TIMELINE_PRESENTATIONS)[number];

export const TIMELINE_EVENT_KINDS = [
  'client_created',
  'client_updated',
  'project_created',
  'project_status_changed',
  'work_order_created',
  'work_order_status_changed',
  'quote_created',
  'quote_submitted',
  'quote_approved',
  'quote_rejected',
  'commercial_quote_issued',
  'commercial_quote_accepted',
  'contract_created',
  'change_requested',
  'change_approved',
  'milestone_created',
  'milestone_achieved',
  'boq_progress_approved',
  'billing_created',
  'billing_voided',
  'payment_received',
  'document_uploaded',
  'document_versioned',
  'approval_decided',
  'financial_correction',
  'indexed',
] as const;

export type TimelineEventKind = (typeof TIMELINE_EVENT_KINDS)[number];

export type TimelineEventSource = 'canonical' | 'index';

export interface TimelineEvent {
  readonly id: string;
  readonly occurredAt: Date;
  readonly category: TimelineCategory;
  readonly kind: TimelineEventKind;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly deepLink: string | null;
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly status: string | null;
  readonly presentation: TimelinePresentation;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly billingKind: string | null;
  readonly source: TimelineEventSource;
}

export interface TimelineFilter {
  readonly category?: TimelineCategory | 'all';
  readonly sort?: TimelineSortDirection;
}

/** Serializable client-card DTO (ISO timestamps). */
export interface ClientTimelineEventView {
  readonly id: string;
  readonly occurredAt: string;
  readonly category: TimelineCategory;
  readonly kind: TimelineEventKind;
  readonly entityType: string;
  readonly entityId: string;
  readonly summary: string;
  readonly deepLink: string | null;
  readonly actorName: string | null;
  readonly status: string | null;
  readonly presentation: TimelinePresentation;
  readonly projectName: string | null;
  readonly source: TimelineEventSource;
}

export const TIMELINE_HARD_CAP = 200;

export function timelineEventKey(event: {
  readonly kind: string;
  readonly entityType: string;
  readonly entityId: string;
}): string {
  return `${event.kind}:${event.entityType}:${event.entityId}`;
}

export function workEntityHref(workKind: string, id: string): string {
  if (workKind === 'work_order') return `/work-orders/${id}`;
  if (workKind === 'job') return `/jobs/${id}`;
  return `/projects/${id}`;
}

export function isKnownTimelineKind(value: string): value is TimelineEventKind {
  return (TIMELINE_EVENT_KINDS as readonly string[]).includes(value);
}

export function categoryForKind(kind: TimelineEventKind): TimelineCategory {
  switch (kind) {
    case 'client_created':
    case 'client_updated':
      return 'client';
    case 'project_created':
    case 'project_status_changed':
      return 'project';
    case 'work_order_created':
    case 'work_order_status_changed':
      return 'work_order';
    case 'quote_created':
    case 'quote_submitted':
    case 'quote_approved':
    case 'quote_rejected':
    case 'commercial_quote_issued':
    case 'commercial_quote_accepted':
      return 'quote';
    case 'contract_created':
      return 'contract';
    case 'change_requested':
    case 'change_approved':
      return 'change';
    case 'milestone_created':
    case 'milestone_achieved':
    case 'boq_progress_approved':
      return 'milestone';
    case 'billing_created':
    case 'billing_voided':
    case 'payment_received':
      return 'billing';
    case 'document_uploaded':
    case 'document_versioned':
      return 'document';
    case 'approval_decided':
      return 'approval';
    case 'financial_correction':
      return 'correction';
    default:
      return 'client';
  }
}

export function timelineKindMessageKey(kind: TimelineEventKind): string {
  return kind.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Voided billing must never appear as an open invoice. Draft is not "active".
 * Credit notes are billing history, not invoices.
 */
export function isShownAsActiveInvoice(
  event: Pick<TimelineEvent, 'kind' | 'presentation' | 'billingKind'>,
): boolean {
  if (event.kind !== 'billing_created') return false;
  if (event.presentation !== 'active') return false;
  if (event.billingKind === 'credit_note') return false;
  return true;
}

export function mapBillingStatusToTimeline(status: 'draft' | 'finalized' | 'void'): {
  readonly kind: Extract<TimelineEventKind, 'billing_created' | 'billing_voided'>;
  readonly presentation: TimelinePresentation;
} {
  if (status === 'void') {
    return { kind: 'billing_voided', presentation: 'void' };
  }
  if (status === 'draft') {
    return { kind: 'billing_created', presentation: 'draft' };
  }
  return { kind: 'billing_created', presentation: 'active' };
}

export function sortTimelineEvents(
  events: readonly TimelineEvent[],
  direction: TimelineSortDirection = 'newest',
): TimelineEvent[] {
  const copy = [...events];
  copy.sort((left, right) => {
    const delta = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (delta !== 0) return direction === 'newest' ? -delta : delta;
    return timelineEventKey(left).localeCompare(timelineEventKey(right));
  });
  return copy;
}

export function filterTimelineEvents(
  events: readonly TimelineEvent[],
  category: TimelineCategory | 'all' = 'all',
): TimelineEvent[] {
  if (category === 'all') return [...events];
  return events.filter((event) => event.category === category);
}

export function omitContradictoryBilling(events: readonly TimelineEvent[]): TimelineEvent[] {
  const voidedBillingIds = new Set(
    events
      .filter(
        (event) =>
          event.entityType === 'billing_record' &&
          (event.kind === 'billing_voided' || event.presentation === 'void'),
      )
      .map((event) => event.entityId),
  );

  return events.filter((event) => {
    if (event.entityType !== 'billing_record') return true;
    if (!voidedBillingIds.has(event.entityId)) return true;
    return !isShownAsActiveInvoice(event);
  });
}

/**
 * Canonical rows win on the same (kind, entityType, entityId).
 * Index rows that call a voided billing record an active invoice are dropped.
 */
export function mergeCanonicalAndIndexEvents(
  canonical: readonly TimelineEvent[],
  indexed: readonly TimelineEvent[],
): TimelineEvent[] {
  const voidedBillingIds = new Set(
    canonical
      .filter(
        (event) =>
          event.entityType === 'billing_record' &&
          (event.kind === 'billing_voided' || event.presentation === 'void'),
      )
      .map((event) => event.entityId),
  );

  const canonicalKeys = new Set(canonical.map(timelineEventKey));

  const keptIndex = indexed.filter((event) => {
    if (canonicalKeys.has(timelineEventKey(event))) return false;
    if (event.entityType !== 'billing_record') return true;
    if (!voidedBillingIds.has(event.entityId)) return true;
    if (event.kind === 'billing_voided' || event.presentation === 'void') return true;
    return false;
  });

  return omitContradictoryBilling([...canonical, ...keptIndex]);
}

export function capTimelineEvents(
  events: readonly TimelineEvent[],
  limit: number = TIMELINE_HARD_CAP,
): TimelineEvent[] {
  if (events.length <= limit) return [...events];
  return events.slice(0, limit);
}
