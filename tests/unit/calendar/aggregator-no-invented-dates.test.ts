import { describe, expect, it } from 'vitest';
import { aggregateCalendarItems, toStoredCalendarDate } from '@/modules/calendar/domain/aggregate';
import type { DatedCalendarSource } from '@/modules/calendar/domain/types';

describe('calendar aggregator does not invent dates', () => {
  it('drops sources with null, empty, or invalid dates', () => {
    const sources: DatedCalendarSource[] = [
      { id: '1', kind: 'meeting', source: 'native', title: 'Kickoff', date: '2026-08-20' },
      { id: '2', kind: 'inspection', source: 'existing', title: 'No date', date: null },
      { id: '3', kind: 'task', source: 'existing', title: 'Empty', date: '' },
      { id: '4', kind: 'warranty', source: 'existing', title: 'Invalid', date: 'not-a-date' },
      { id: '5', kind: 'follow_up', source: 'existing', title: 'Bad Date', date: new Date('invalid') },
    ];
    const items = aggregateCalendarItems(sources);
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('1');
    expect(items[0]?.date).toBe('2026-08-20');
  });

  it('does not substitute today when a date is missing', () => {
    expect(toStoredCalendarDate(null)).toBeNull();
    expect(toStoredCalendarDate(undefined)).toBeNull();
    const items = aggregateCalendarItems([
      { id: 'x', kind: 'milestone', source: 'existing', title: 'Missing target', date: null },
    ]);
    expect(items).toEqual([]);
  });

  it('keeps only the stored date on a source, never a sibling fallback', () => {
    const items = aggregateCalendarItems([
      {
        id: 'planning-start:1',
        kind: 'task',
        source: 'existing',
        title: 'Has start only',
        date: '2026-09-01',
      },
    ]);
    expect(items.map((item) => item.date)).toEqual(['2026-09-01']);
  });
});
