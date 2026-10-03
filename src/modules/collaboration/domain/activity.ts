import type { ProjectCapability } from '@/modules/project-team/domain/capabilities';

/**
 * Project activity feed - pure presentation + redaction rules over `domain_events`.
 *
 * Financial events (claims, certification, deductions, retention, payments, budgets, contract values)
 * are shown to operational viewers only as a redacted "financial update" line: no title, no payload,
 * no deep link. A viewer sees the details when holding ANY of the required financial capabilities.
 */

export interface ActivityEventRecord {
  readonly id: string;
  readonly eventType: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly projectId: string | null;
  readonly actorType: 'internal' | 'external' | 'system';
  readonly actorUserId: string | null;
  readonly actorPrincipalId: string | null;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: Date;
}

export interface ActivityItem {
  readonly id: string;
  readonly occurredAt: string;
  readonly eventType: string;
  /** i18n key inside the `collaboration` namespace. */
  readonly messageKey: string;
  readonly domain: string;
  readonly entityType: string | null;
  readonly entityId: string | null;
  readonly title: string | null;
  readonly detail: ActivityDetail | null;
  readonly actor: { readonly type: 'internal' | 'external' | 'system'; readonly id: string | null };
  readonly redacted: boolean;
  readonly href: string | null;
}

export interface ActivityDetail {
  readonly fromStatus?: string;
  readonly toStatus?: string;
  readonly outcome?: string;
  readonly audience?: string;
}

const C = {
  FINANCIAL_VIEW: 'financial.view',
  CONTRACT_FINANCIAL_VIEW: 'contract.financial.view',
  CLAIM_VIEW: 'claim.view',
  PAYMENT_VIEW: 'payment.view',
  PROJECT_BUDGET_VIEW: 'project_budget.view',
} as const satisfies Record<string, ProjectCapability>;

interface FinancialRule {
  readonly prefix: string;
  readonly anyOf: readonly ProjectCapability[];
}

const FINANCIAL_RULES: readonly FinancialRule[] = [
  { prefix: 'subcontract.claim.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'subcontract.certification.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'subcontract.deduction.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'subcontract.retention.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'subcontract.advance.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'subcontract.payment.', anyOf: [C.PAYMENT_VIEW] },
  { prefix: 'subcontract.value.', anyOf: [C.CONTRACT_FINANCIAL_VIEW] },
  { prefix: 'subcontract.price.', anyOf: [C.CONTRACT_FINANCIAL_VIEW] },
  { prefix: 'claim.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'deduction.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'retention.', anyOf: [C.CLAIM_VIEW] },
  { prefix: 'payment.', anyOf: [C.PAYMENT_VIEW] },
  { prefix: 'ap.', anyOf: [C.PAYMENT_VIEW] },
  { prefix: 'budget.', anyOf: [C.PROJECT_BUDGET_VIEW, C.FINANCIAL_VIEW] },
  { prefix: 'cost_control.', anyOf: [C.PROJECT_BUDGET_VIEW, C.FINANCIAL_VIEW] },
];

/** SQL LIKE patterns for the financial prefixes (repository excludes nothing; redaction is per item). */
export const FINANCIAL_EVENT_PREFIXES: readonly string[] = FINANCIAL_RULES.map((rule) => rule.prefix);

/** null = operational event. Payload `financial: true` marks any other event financial. */
export function financialCapabilitiesFor(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
): readonly ProjectCapability[] | null {
  const rule = FINANCIAL_RULES.find((candidate) => eventType.startsWith(candidate.prefix));
  if (rule) return rule.anyOf;
  if (payload && payload.financial === true) return [C.FINANCIAL_VIEW];
  return null;
}

export function canSeeEventDetails(
  eventType: string,
  payload: Record<string, unknown> | null | undefined,
  held: ReadonlySet<string>,
): boolean {
  const required = financialCapabilitiesFor(eventType, payload);
  if (!required) return true;
  return required.some((capability) => held.has(capability));
}

export function eventDomain(eventType: string): string {
  return eventType.split('.')[0] ?? eventType;
}

/** `task.external.assigned` -> `activity.events.task_external_assigned`. */
export function eventMessageKey(eventType: string): string {
  return `activity.events.${eventType.replace(/\./g, '_')}`;
}

export const GENERIC_EVENT_KEY = 'activity.events.generic';
export const REDACTED_EVENT_KEY = 'activity.events.financialRedacted';

/** Internal deep links per entity type (route table, section 2 of the track briefs). */
const ENTITY_ROUTES: Readonly<Record<string, (projectId: string, id: string) => string>> = {
  task: (_p, id) => `/tasks/${id}`,
  coordination_event: (p, id) => `/projects/${p}/coordination/${id}`,
  rfi: (p, id) => `/projects/${p}/rfi/${id}`,
  submittal: (p, id) => `/projects/${p}/submittals/${id}`,
  inspection: (p, id) => `/projects/${p}/inspections/${id}`,
  defect: (p, id) => `/projects/${p}/defects/${id}`,
  site_instruction: (p, id) => `/projects/${p}/instructions/${id}`,
  site_meeting: (p, id) => `/projects/${p}/site-meetings/${id}`,
  drawing: (p, id) => `/projects/${p}/plans/${id}`,
  subcontract_agreement: (p, id) => `/projects/${p}/contractors/${id}`,
  subcontract_claim: (p, id) => `/projects/${p}/claims/${id}`,
  tender_package: (p, id) => `/projects/${p}/tenders/${id}`,
};

export function internalEntityHref(projectId: string | null, entityType: string, entityId: string): string | null {
  if (!projectId) return null;
  const route = ENTITY_ROUTES[entityType];
  return route ? route(projectId, entityId) : null;
}

function stringField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 && value.length <= 300 ? value : undefined;
}

/**
 * Builds the viewer-safe item. `hasMessage(key)` reports whether the locale catalog has a dedicated
 * sentence for the event type (fallback: generic sentence with the humanized type).
 */
export function toActivityItem(
  record: ActivityEventRecord,
  held: ReadonlySet<string>,
  hasMessage: (key: string) => boolean,
): ActivityItem {
  const visible = canSeeEventDetails(record.eventType, record.payload, held);
  const actor = {
    type: record.actorType,
    id: record.actorType === 'internal' ? record.actorUserId : record.actorType === 'external' ? record.actorPrincipalId : null,
  };
  if (!visible) {
    return {
      id: record.id,
      occurredAt: record.occurredAt.toISOString(),
      eventType: 'financial',
      messageKey: REDACTED_EVENT_KEY,
      domain: 'financial',
      entityType: null,
      entityId: null,
      title: null,
      detail: null,
      actor,
      redacted: true,
      href: null,
    };
  }
  const key = eventMessageKey(record.eventType);
  const payload = record.payload ?? {};
  const detail: ActivityDetail = {
    fromStatus: stringField(payload, 'fromStatus'),
    toStatus: stringField(payload, 'toStatus'),
    outcome: stringField(payload, 'outcome'),
    audience: stringField(payload, 'audience'),
  };
  const hasDetail = Object.values(detail).some((value) => value !== undefined);
  return {
    id: record.id,
    occurredAt: record.occurredAt.toISOString(),
    eventType: record.eventType,
    messageKey: hasMessage(key) ? key : GENERIC_EVENT_KEY,
    domain: eventDomain(record.eventType),
    entityType: record.entityType,
    entityId: record.entityId,
    title: stringField(payload, 'title') ?? null,
    detail: hasDetail ? detail : null,
    actor,
    redacted: false,
    href: internalEntityHref(record.projectId, record.entityType, record.entityId),
  };
}

/** `subcontract.claim.submitted` -> `subcontract claim submitted` (fallback wording). */
export function humanizeEventType(eventType: string): string {
  return eventType.replace(/[._]/g, ' ');
}

export interface ActivityCursor {
  readonly occurredAt: Date;
  readonly id: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeActivityCursor(cursor: ActivityCursor): string {
  return `${cursor.occurredAt.toISOString()}_${cursor.id}`;
}

export function decodeActivityCursor(raw: string | null | undefined): ActivityCursor | null {
  if (!raw) return null;
  const index = raw.lastIndexOf('_');
  if (index <= 0) return null;
  const date = new Date(raw.slice(0, index));
  const id = raw.slice(index + 1);
  if (Number.isNaN(date.getTime()) || !UUID_RE.test(id)) return null;
  return { occurredAt: date, id };
}

export const ACTIVITY_PAGE_SIZE = 30;
export const ACTIVITY_MAX_PAGE_SIZE = 100;

export function clampActivityLimit(limit: number | null | undefined): number {
  if (!limit || !Number.isFinite(limit)) return ACTIVITY_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), ACTIVITY_MAX_PAGE_SIZE);
}
