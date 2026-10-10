/**
 * Maps stable domain event types (`subcontract.claim.submitted`) to
 * `settings.activity.actions` keys (`actions.subcontract_claim.submitted`).
 */
export function domainEventToSettingsActionKey(eventType: string): string | null {
  const parts = eventType.split('.').filter(Boolean);
  if (parts.length < 2) return null;
  const verb = parts[parts.length - 1]!;
  const entity = parts.slice(0, -1).join('_');
  return `actions.${entity}.${verb}`;
}

/** Reverse of {@link humanizeEventType} for legacy rows stored with humanized type labels. */
export function legacyHumanizedEventToDomainType(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('.')) return null;
  const normalized = trimmed.replace(/\s+/g, ' ');
  return LEGACY_HUMANIZED_EVENT_TYPES[normalized] ?? null;
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

export function resolveDomainEventTypeForLabel(eventType: string): string {
  const legacy = legacyHumanizedEventToDomainType(eventType);
  return legacy ?? eventType;
}
