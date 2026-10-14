import { describe, expect, it } from 'vitest';
import { buildRruleFromPreset, weekdayCodeForDate } from '@/modules/tasks/domain/recurrence-presets';

describe('recurrence presets in org timezone', () => {
  it('uses Sunday BYDAY when startsAt is Sunday 01:30 in Asia/Jerusalem', () => {
    const startsAt = new Date('2026-10-17T22:30:00.000Z');
    expect(weekdayCodeForDate(startsAt, 'Asia/Jerusalem')).toBe('SU');
    const rrule = buildRruleFromPreset('weekly', { startsAt, timeZone: 'Asia/Jerusalem' });
    expect(rrule).toContain('BYDAY=SU');
  });
});
