import { describe, expect, it } from 'vitest';
import { expandOccurrences } from '@/modules/tasks/domain/recurrence';
import { buildOccurrenceDueDate } from '@/modules/tasks/application/process-recurrence-occurrences';
import type { TaskRecurrenceRule } from '@/modules/tasks/domain/types';

function rule(partial: Partial<TaskRecurrenceRule> & Pick<TaskRecurrenceRule, 'rrule' | 'startsAt'>): TaskRecurrenceRule {
  return {
    id: 'rule-1',
    organizationId: 'org-1',
    timezone: 'Asia/Jerusalem',
    endsAt: null,
    maxOccurrences: null,
    templateTaskId: 'task-1',
    isActive: true,
    createdByOrgMemberId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('task recurrence dtstart anchoring', () => {
  it('returns identical occurrence_at across two expansions 1.5s apart', async () => {
    const anchored = rule({
      rrule: 'FREQ=DAILY',
      startsAt: new Date('2026-09-21T05:00:00.000Z'),
      timezone: 'Asia/Jerusalem',
    });
    const from = new Date('2026-09-21T00:00:00.000Z');
    const to = new Date('2026-09-25T00:00:00.000Z');

    const first = await expandOccurrences(anchored, from, to);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const second = await expandOccurrences(anchored, from, to);

    expect(first.map((slot) => slot.occurrenceAt.toISOString())).toEqual(
      second.map((slot) => slot.occurrenceAt.toISOString()),
    );
    expect(first.length).toBeGreaterThan(0);
  });

  it('keeps 08:00 local through DST transitions in Asia/Jerusalem', async () => {
    const anchored = rule({
      rrule: 'FREQ=DAILY',
      startsAt: new Date('2026-01-15T06:00:00.000Z'),
      timezone: 'Asia/Jerusalem',
    });
    const spring = await expandOccurrences(
      anchored,
      new Date('2026-03-26T00:00:00.000Z'),
      new Date('2026-03-29T00:00:00.000Z'),
    );
    const hourSpring = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(spring.find((s) => s.occurrenceAt >= new Date('2026-03-27T00:00:00.000Z'))!.occurrenceAt);
    expect(Number.parseInt(hourSpring, 10)).toBe(8);

    const fallRule = rule({
      rrule: 'FREQ=DAILY',
      startsAt: new Date('2026-01-15T06:00:00.000Z'),
      timezone: 'Asia/Jerusalem',
    });
    const fall = await expandOccurrences(
      fallRule,
      new Date('2026-10-24T00:00:00.000Z'),
      new Date('2026-10-27T00:00:00.000Z'),
    );
    const hourFall = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      hour: 'numeric',
      hour12: false,
    }).format(fall.find((s) => s.occurrenceAt >= new Date('2026-10-25T00:00:00.000Z'))!.occurrenceAt);
    expect(Number.parseInt(hourFall, 10)).toBe(8);
  });

  it('maps 00:30 local occurrence to the local calendar due date', () => {
    const occurrenceAt = new Date('2026-09-21T21:30:00.000Z');
    expect(buildOccurrenceDueDate(occurrenceAt, 'Asia/Jerusalem')).toBe('2026-09-22');
  });
});
