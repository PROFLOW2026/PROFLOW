import { describe, expect, it } from 'vitest';
import {
  computePostponedDueDate,
  resolvePostponementBaseDate,
} from '@/modules/tasks/domain/postpone-task-due-date';
import { businessDate } from '@/shared/dates';

const today = businessDate('2026-09-28');

describe('resolvePostponementBaseDate', () => {
  it('uses future due date as base', () => {
    expect(resolvePostponementBaseDate('2026-10-05', today)).toBe('2026-10-05');
  });

  it('uses today when due date is in the past', () => {
    expect(resolvePostponementBaseDate('2026-09-01', today)).toBe(today);
  });

  it('uses today when due date is missing', () => {
    expect(resolvePostponementBaseDate(null, today)).toBe(today);
  });
});

describe('computePostponedDueDate', () => {
  it('adds one day from current due date when still valid', () => {
    expect(computePostponedDueDate('day', '2026-09-28', today)).toBe('2026-09-29');
  });

  it('adds one week from today when due date is overdue', () => {
    expect(computePostponedDueDate('week', '2026-09-01', today)).toBe('2026-10-05');
  });

  it('adds one calendar month from current due date', () => {
    expect(computePostponedDueDate('month', '2026-10-12', today)).toBe('2026-11-12');
  });

  it('accepts a custom future date', () => {
    expect(computePostponedDueDate('custom', '2026-09-01', today, '2026-11-01')).toBe(
      '2026-11-01',
    );
  });

  it('rejects custom dates that are not in the future', () => {
    expect(() => computePostponedDueDate('custom', '2026-09-01', today, today)).toThrow();
    expect(() => computePostponedDueDate('custom', '2026-09-01', today, '2026-09-01')).toThrow();
  });
});
