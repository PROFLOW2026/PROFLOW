import { describe, expect, it } from 'vitest';
import {
  canSeeEventDetails,
  eventMessageKey,
  financialCapabilitiesFor,
  toActivityItem,
} from '@/modules/collaboration/domain/activity';
import { PROJECT_CAPABILITIES } from '@/modules/project-team/domain/capabilities';

describe('activity feed (pure)', () => {
  it('redacts financial events for operational viewers', () => {
    const held = new Set<string>([PROJECT_CAPABILITIES.PROJECT_VIEW, PROJECT_CAPABILITIES.TASKS_VIEW]);
    expect(financialCapabilitiesFor('subcontract.claim.certified', {})).toContain(PROJECT_CAPABILITIES.CLAIM_VIEW);
    expect(canSeeEventDetails('subcontract.claim.certified', { title: 'x' }, held)).toBe(false);
    const item = toActivityItem(
      {
        id: '1',
        eventType: 'subcontract.claim.certified',
        entityType: 'subcontract_claim',
        entityId: 'e',
        projectId: 'p',
        actorType: 'internal',
        actorUserId: 'u',
        actorPrincipalId: null,
        payload: { title: 'secret' },
        occurredAt: new Date('2026-01-01T12:00:00Z'),
      },
      held,
      () => true,
    );
    expect(item.redacted).toBe(true);
    expect(item.title).toBeNull();
  });

  it('maps event types to message keys', () => {
    expect(eventMessageKey('task.external.assigned')).toBe('activity.events.task_external_assigned');
  });
});
