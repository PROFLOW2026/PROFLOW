import { describe, expect, it } from 'vitest';
import {
  calendarMonthGridBounds,
  resolveCalendarMonthDueWindow,
} from '@/modules/tasks/domain/calendar-month-window';
import { businessDate } from '@/shared/dates';

describe('resolveCalendarMonthDueWindow', () => {
  it('defaults to the org today month', () => {
    const window = resolveCalendarMonthDueWindow({}, businessDate('2026-03-15'));
    expect(window.monthKey).toBe('2026-03');
    expect(window.dueFrom).toBe('2026-03-01');
    expect(window.dueTo).toBe('2026-03-31');
  });

  it('honors month=YYYY-MM', () => {
    const window = resolveCalendarMonthDueWindow({ month: '2026-02' }, businessDate('2026-03-15'));
    expect(window.monthKey).toBe('2026-02');
    expect(window.dueFrom).toBe('2026-02-01');
    expect(window.dueTo).toBe('2026-02-28');
  });

  it('honors explicit dueFrom/dueTo pair', () => {
    const window = resolveCalendarMonthDueWindow(
      { dueFrom: '2026-04-10', dueTo: '2026-04-20' },
      businessDate('2026-03-15'),
    );
    expect(window.dueFrom).toBe('2026-04-10');
    expect(window.dueTo).toBe('2026-04-20');
    expect(window.monthKey).toBe('2026-04');
  });
});

describe('calendarMonthGridBounds', () => {
  it('pads March 2026 to a Sunday-start grid', () => {
    const { gridFrom, gridTo } = calendarMonthGridBounds(
      businessDate('2026-03-01'),
      businessDate('2026-03-31'),
    );
    expect(gridFrom).toBe('2026-03-01');
    expect(gridTo).toBe('2026-04-04');
  });
});
