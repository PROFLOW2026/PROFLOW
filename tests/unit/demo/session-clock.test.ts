import { describe, expect, it } from 'vitest';
import { demoDay, demoDays } from '@/modules/demo/domain/session-clock';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe('session-clock', () => {
  it('resolves the Jerusalem session day near UTC midnight (winter UTC+2)', () => {
    const anchor = new Date('2026-01-15T22:30:00Z');
    expect(demoDay(anchor, 0)).toBe('2026-01-16');
    expect(demoDay(anchor, -1)).toBe('2026-01-15');
    expect(demoDay(anchor, 7)).toBe('2026-01-23');
    expect(demoDay(anchor, 0)).toMatch(ISO_DATE);
  });

  it('resolves the Jerusalem session day during daylight saving (UTC+3)', () => {
    const anchor = new Date('2026-07-15T21:30:00Z');
    expect(demoDay(anchor, 0)).toBe('2026-07-16');
    expect(demoDay(anchor, 0)).toMatch(ISO_DATE);
  });

  it('shifts across month boundaries on the Jerusalem calendar', () => {
    const anchor = new Date('2026-03-01T12:00:00Z');
    expect(demoDay(anchor, 0)).toBe('2026-03-01');
    expect(demoDay(anchor, -1)).toBe('2026-02-28');
  });

  it('maps offsets with demoDays', () => {
    const anchor = new Date('2026-01-15T22:30:00Z');
    expect(demoDays(anchor, [0, -1, 7])).toEqual(['2026-01-16', '2026-01-15', '2026-01-23']);
    for (const value of demoDays(anchor, [0, -1, 7])) {
      expect(value).toMatch(ISO_DATE);
    }
  });
});