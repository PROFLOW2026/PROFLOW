import { describe, expect, it } from 'vitest';
import enCollaboration from '@/locales/en/collaboration.json';
import enSettings from '@/locales/en/settings.json';
import heCollaboration from '@/locales/he-IL/collaboration.json';
import heSettings from '@/locales/he-IL/settings.json';
import {
  collaborationActivityEventKey,
  domainEventToSettingsActionKey,
  legacyHumanizedEventToDomainType,
  resolveDomainEventTypeForLabel,
} from '@/modules/collaboration/domain/activity-event-label';
import { GENERIC_EVENT_KEY, toActivityItem } from '@/modules/collaboration/domain/activity';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';

const PRODUCTION_EVENT_TYPES = [
  'subcontract.claim.reassessed',
  'subcontract.deduction.issued',
  'subcontract.claim.submitted',
  'coordination.readiness.requested',
  'coordination.contractor.ready',
  'subcontract.agreement.created',
  'external.principal.invited',
  'subcontract.agreement.activated',
  'external.grant.created',
] as const;

function hasSettingsAction(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'actions') return false;
  const group = (enSettings.activity.actions as unknown as Record<string, Record<string, string>>)[parts[1]!];
  return typeof group?.[parts[2]!] === 'string';
}

function hasCollaborationEvent(key: string): boolean {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'activity' || parts[1] !== 'events') return false;
  const events = enCollaboration.activity.events as Record<string, string>;
  return typeof events[parts[2]!] === 'string';
}

const PRODUCTION_HUMANIZED_LABELS = [
  'subcontract claim reassessed',
  'subcontract deduction issued',
  'subcontract claim submitted',
  'coordination readiness requested',
  'coordination contractor ready',
  'subcontract agreement created',
  'external principal invited',
  'subcontract agreement activated',
  'external grant created',
] as const;

describe('activity event labels', () => {
  it('maps domain event types to settings.activity.actions keys', () => {
    for (const eventType of PRODUCTION_EVENT_TYPES) {
      const key = domainEventToSettingsActionKey(eventType);
      expect(key, eventType).toBeTruthy();
      expect(hasSettingsAction(key!), eventType).toBe(true);
    }
  });

  it('maps legacy humanized production labels back to domain types', () => {
    for (const eventType of PRODUCTION_EVENT_TYPES) {
      const human = eventType.replace(/\./g, ' ');
      expect(legacyHumanizedEventToDomainType(human)).toBe(eventType);
    }
    for (const human of PRODUCTION_HUMANIZED_LABELS) {
      expect(legacyHumanizedEventToDomainType(human)).toBeTruthy();
    }
  });

  it('resolves settings keys from legacy humanized rows stored in the database', () => {
    for (const human of PRODUCTION_HUMANIZED_LABELS) {
      const key = domainEventToSettingsActionKey(human);
      expect(key, human).toBeTruthy();
      expect(hasSettingsAction(key!), human).toBe(true);
    }
  });

  it('exposes collaboration activity keys for production domain events', () => {
    for (const eventType of PRODUCTION_EVENT_TYPES) {
      const key = collaborationActivityEventKey(eventType);
      expect(hasCollaborationEvent(key), eventType).toBe(true);
    }
  });

  it('prefers collaboration catalog for production events when locale keys exist', () => {
    const held = new Set<string>([PROJECT_CAPABILITIES.PROJECT_VIEW, PROJECT_CAPABILITIES.CLAIM_VIEW]);
    for (const eventType of PRODUCTION_EVENT_TYPES) {
      const item = toActivityItem(
        {
          id: '1',
          eventType,
          entityType: 'subcontract_claim',
          entityId: 'e',
          projectId: 'p',
          actorType: 'internal',
          actorUserId: 'u',
          actorPrincipalId: null,
          payload: {},
          occurredAt: new Date('2026-01-01T12:00:00Z'),
        },
        held,
        hasCollaborationEvent,
        hasSettingsAction,
      );
      expect(item.messageCatalog, eventType).toBe('collaboration');
      expect(item.messageKey, eventType).not.toBe(GENERIC_EVENT_KEY);
    }
  });

  it('localizes legacy humanized production rows via collaboration keys', () => {
    const held = new Set<string>([PROJECT_CAPABILITIES.PROJECT_VIEW, PROJECT_CAPABILITIES.CLAIM_VIEW]);
    for (const human of PRODUCTION_HUMANIZED_LABELS) {
      const item = toActivityItem(
        {
          id: '1',
          eventType: human,
          entityType: 'subcontract_claim',
          entityId: 'e',
          projectId: 'p',
          actorType: 'internal',
          actorUserId: 'u',
          actorPrincipalId: null,
          payload: {},
          occurredAt: new Date('2026-01-01T12:00:00Z'),
        },
        held,
        hasCollaborationEvent,
        hasSettingsAction,
      );
      expect(item.messageCatalog, human).toBe('collaboration');
      expect(item.messageKey, human).not.toBe(GENERIC_EVENT_KEY);
      const suffix = item.messageKey.replace('activity.events.', '');
      const heLabel = (heCollaboration.activity.events as Record<string, string>)[suffix];
      expect(heLabel, human).toBeTruthy();
      expect(heLabel).not.toMatch(/^[a-z\s]+$/i);
    }
  });

  it('prefers settings.activity catalog when collaboration key is missing', () => {
    const held = new Set<string>([PROJECT_CAPABILITIES.PROJECT_VIEW, PROJECT_CAPABILITIES.CLAIM_VIEW]);
    const item = toActivityItem(
      {
        id: '1',
        eventType: 'subcontract.claim.submitted',
        entityType: 'subcontract_claim',
        entityId: 'e',
        projectId: 'p',
        actorType: 'internal',
        actorUserId: 'u',
        actorPrincipalId: null,
        payload: { title: 'Claim A' },
        occurredAt: new Date('2026-01-01T12:00:00Z'),
      },
      held,
      () => false,
      hasSettingsAction,
    );
    expect(item.messageCatalog).toBe('settings.activity');
    expect(item.messageKey).toBe('actions.subcontract_claim.submitted');
    expect(item.messageKey).not.toBe(GENERIC_EVENT_KEY);
  });

  it('has Hebrew labels for reported production event types', () => {
    for (const eventType of PRODUCTION_EVENT_TYPES) {
      const key = domainEventToSettingsActionKey(resolveDomainEventTypeForLabel(eventType));
      const parts = key!.split('.');
      const group = (heSettings.activity.actions as unknown as Record<string, Record<string, string>>)[parts[1]!];
      const label = group?.[parts[2]!];
      expect(label, eventType).toBeTruthy();
      expect(label).not.toMatch(/^[a-z\s]+$/i);
    }
  });
});
