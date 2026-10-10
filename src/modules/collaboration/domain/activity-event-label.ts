import { DOMAIN_EVENTS } from '@/shared/domain-events/registry';

/**
 * Maps stable domain event types (`subcontract.claim.submitted`) to
 * `settings.activity.actions` keys (`actions.subcontract_claim.submitted`).
 */
export function domainEventToSettingsActionKey(eventType: string): string | null {
  const resolved = resolveDomainEventTypeForLabel(eventType);
  const parts = resolved.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const verb = parts[parts.length - 1]!;
  const entity = parts.slice(0, -1).join('_');
  return `actions.${entity}.${verb}`;
}

/** Matches {@link humanizeEventType} in activity.ts (kept local to avoid circular imports). */
function humanizeDomainEventType(eventType: string): string {
  return eventType.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

const LEGACY_HUMANIZED_EVENT_TYPES: Readonly<Record<string, string>> = {
  'subcontract claim reassessed': 'subcontract.claim.reassessed',
  'subcontract deduction issued': 'subcontract.deduction.issued',
  'subcontract claim submitted': 'subcontract.claim.submitted',
  'coordination readiness requested': 'coordination.readiness.requested',
  'coordination contractor ready': 'coordination.contractor.ready',
  'subcontract agreement created': 'subcontract.agreement.created',
  'external principal invited': 'external.principal.invited',
  'subcontract agreement activated': 'subcontract.agreement.activated',
  'external grant created': 'external.grant.created',
};

const HUMANIZED_LABEL_TO_DOMAIN: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [human, domainType] of Object.entries(LEGACY_HUMANIZED_EVENT_TYPES)) {
    map.set(humanizeDomainEventType(human), domainType);
  }
  for (const domainType of Object.values(DOMAIN_EVENTS)) {
    map.set(humanizeDomainEventType(domainType), domainType);
  }
  return map;
})();

/** Reverse of {@link humanizeEventType} for legacy rows stored with humanized type labels. */
export function legacyHumanizedEventToDomainType(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('.')) return null;
  return HUMANIZED_LABEL_TO_DOMAIN.get(humanizeDomainEventType(trimmed)) ?? null;
}

export function resolveDomainEventTypeForLabel(eventType: string): string {
  const legacy = legacyHumanizedEventToDomainType(eventType);
  return legacy ?? eventType;
}

/** `collaboration` namespace key for a domain event (`activity.events.subcontract_claim_submitted`). */
export function collaborationActivityEventKey(eventType: string): string {
  const resolved = resolveDomainEventTypeForLabel(eventType);
  return `activity.events.${resolved.replace(/\./g, '_')}`;
}
