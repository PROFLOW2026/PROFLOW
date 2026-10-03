import { describe, expect, it } from 'vitest';
import { COORDINATION_EVENT_KINDS, COORDINATION_RESPONSE_STATUSES } from '@drizzle/schema';
import { EVENT_KINDS, RESPONSE_STATUSES, calendarWindow } from '@/modules/coordination/domain/constants';
import { COORDINATION_DOMAIN_EVENTS } from '@/shared/domain-events/events/coordination';
import { COORDINATION_AUDIT_ACTIONS } from '@/shared/audit/dg/coordination';

describe('coordination client-safe constants', () => {
  it('mirror the schema enums exactly', () => {
    expect([...EVENT_KINDS]).toEqual([...COORDINATION_EVENT_KINDS]);
    expect([...RESPONSE_STATUSES]).toEqual([...COORDINATION_RESPONSE_STATUSES]);
  });

  it('builds a calendar window around now', () => {
    const now = new Date('2030-01-10T00:00:00Z');
    const { from, to } = calendarWindow(1, 2, now);
    expect(from.toISOString()).toBe('2030-01-09T00:00:00.000Z');
    expect(to.toISOString()).toBe('2030-01-12T00:00:00.000Z');
  });

  it('registers domain events and audit actions in the required shapes', () => {
    for (const type of Object.values(COORDINATION_DOMAIN_EVENTS)) {
      expect(type).toMatch(/^coordination(\.[a-z][a-z0-9_]*){2,}$/);
    }
    for (const required of [
      'coordination.event.created',
      'coordination.event.rescheduled',
      'coordination.event.completed',
      'coordination.event.cancelled',
      'coordination.readiness.requested',
      'coordination.contractor.ready',
      'coordination.contractor.not_ready',
      'coordination.event.ready',
    ]) {
      expect(Object.values(COORDINATION_DOMAIN_EVENTS)).toContain(required);
    }
    for (const action of Object.values(COORDINATION_AUDIT_ACTIONS)) {
      expect(action).toMatch(/^coordination_[a-z_]+\.[a-z_]+$/);
    }
  });
});
