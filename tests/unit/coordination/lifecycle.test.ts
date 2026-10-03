import { describe, expect, it } from 'vitest';
import {
  acceptsResponses,
  allowedOutcomes,
  canRecordOutcome,
  canReschedule,
  isFinalStatus,
  normalizeAcknowledgements,
  outcomeRequiresActualTimes,
  outcomeRequiresNote,
} from '@/modules/coordination/domain/lifecycle';
import { instantToWallClock, parseEventInstant, wallClockToInstant } from '@/modules/coordination/domain/time';
import { respondSchema } from '@/modules/coordination/validation/schemas';

describe('coordination lifecycle (pure)', () => {
  it('accepts answers only while scheduled', () => {
    expect(acceptsResponses('scheduled')).toBe(true);
    for (const status of ['postponed', 'completed', 'partially_completed', 'cancelled'] as const) {
      expect(acceptsResponses(status)).toBe(false);
    }
  });

  it('allows outcomes per status and keeps final statuses final', () => {
    expect(allowedOutcomes('scheduled')).toEqual(['completed', 'partially_completed', 'postponed', 'cancelled']);
    expect(allowedOutcomes('postponed')).toEqual(['cancelled']);
    expect(allowedOutcomes('completed')).toEqual([]);
    expect(canRecordOutcome('postponed', 'completed')).toBe(false);
    expect(isFinalStatus('partially_completed')).toBe(true);
    expect(isFinalStatus('postponed')).toBe(false);
    expect(canReschedule('postponed')).toBe(true);
    expect(canReschedule('cancelled')).toBe(false);
  });

  it('requires actual times for done work and a note for anything but completed', () => {
    expect(outcomeRequiresActualTimes('completed')).toBe(true);
    expect(outcomeRequiresActualTimes('postponed')).toBe(false);
    expect(outcomeRequiresNote('completed')).toBe(false);
    expect(outcomeRequiresNote('cancelled')).toBe(true);
  });

  it('keys acknowledgements uniquely, including Hebrew labels', () => {
    const items = normalizeAcknowledgements(['Safety briefing read', 'תדריך בטיחות', '', 'safety briefing read', 'תוכנית']);
    expect(items.map((item) => item.key)).toEqual(['safety_briefing_read', 'ack_2', 'ack_3']);
    const appended = normalizeAcknowledgements(['Plan rev C'], items);
    expect(appended.at(-1)).toEqual({ key: 'plan_rev_c', label: 'Plan rev C' });
    expect(appended).toHaveLength(4);
  });
});

describe('coordination wall-clock time', () => {
  it('interprets datetime-local values in the organization time zone (DST aware)', () => {
    expect(wallClockToInstant('2030-01-15T07:00', 'Asia/Jerusalem')?.toISOString()).toBe('2030-01-15T05:00:00.000Z');
    expect(wallClockToInstant('2030-07-15T07:00', 'Asia/Jerusalem')?.toISOString()).toBe('2030-07-15T04:00:00.000Z');
    expect(wallClockToInstant('bad', 'Asia/Jerusalem')).toBeNull();
    expect(instantToWallClock(new Date('2030-07-15T04:00:00.000Z'), 'Asia/Jerusalem')).toBe('2030-07-15T07:00');
  });

  it('keeps explicit ISO instants as-is', () => {
    expect(parseEventInstant('2030-01-15T07:00:00Z', 'Asia/Jerusalem')?.toISOString()).toBe('2030-01-15T07:00:00.000Z');
    expect(parseEventInstant('', 'UTC')).toBeNull();
  });
});

describe('coordination response validation', () => {
  const base = {
    projectId: '00000000-0000-4000-8000-000000000001',
    eventId: '00000000-0000-4000-8000-000000000002',
    participantId: '00000000-0000-4000-8000-000000000003',
  };

  it('demands a note for NOT READY / BLOCKED / READY WITH CONDITIONS', () => {
    for (const status of ['not_ready', 'blocked', 'ready_with_conditions'] as const) {
      expect(respondSchema.safeParse({ ...base, status }).success).toBe(false);
      expect(respondSchema.safeParse({ ...base, status, note: 'Sleeves missing' }).success).toBe(true);
    }
    expect(respondSchema.safeParse({ ...base, status: 'ready' }).success).toBe(true);
    expect(respondSchema.safeParse({ ...base, status: 'acknowledged' }).success).toBe(true);
  });
});
