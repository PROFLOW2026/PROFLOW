import { describe, expect, it } from 'vitest';
import {
  assertYearMonth,
  yearMonthFromBusinessDate,
} from '@/modules/month-close/domain/year-month';
import { canTransitionMonthClose } from '@/modules/month-close/domain/period-state';

describe('yearMonthFromBusinessDate', () => {
  it('derives YYYY-MM from a business date', () => {
    expect(yearMonthFromBusinessDate('2026-08-15')).toBe('2026-08');
  });

  it('rejects malformed input', () => {
    expect(() => yearMonthFromBusinessDate('08')).toThrow();
    expect(() => assertYearMonth('2026-13')).toThrow();
  });
});

describe('month close transitions', () => {
  it('never silently reopens a closed period', () => {
    expect(canTransitionMonthClose('closed', 'open')).toBe(false);
    expect(canTransitionMonthClose('closed', 'ready')).toBe(false);
    expect(canTransitionMonthClose('ready', 'open')).toBe(true);
  });
});
