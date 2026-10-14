import { describe, expect, it } from 'vitest';
import { resolveThisWeekDueRange, upcomingSundayFrom } from '@/modules/tasks/domain/week-window';
import { businessDate } from '@/shared/dates';

describe('week window consistency', () => {
  it('matches My Work this_week upper bound (upcoming Sunday)', () => {
    expect(upcomingSundayFrom(businessDate('2026-10-14'))).toBe('2026-10-18');
    const range = resolveThisWeekDueRange(businessDate('2026-10-14'));
    expect(range).toEqual({ from: '2026-10-14', to: '2026-10-18' });
  });
});
