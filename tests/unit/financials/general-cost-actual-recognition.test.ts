import { describe, expect, it } from 'vitest';
import {
  actualRecognitionThroughYearMonth,
  compareYearMonth,
  isFutureEconomicYearMonth,
  isYearMonthRecognizedForActual,
} from '@/modules/financials/domain/general-cost-actual-recognition';

describe('general cost actual recognition', () => {
  it('compareYearMonth orders calendar months lexicographically', () => {
    expect(compareYearMonth('2026-08', '2026-09')).toBeLessThan(0);
    expect(compareYearMonth('2026-09', '2026-08')).toBeGreaterThan(0);
    expect(compareYearMonth('2026-08', '2026-08')).toBe(0);
  });

  it('recognizes months through current org calendar month for Actual', () => {
    const through = actualRecognitionThroughYearMonth('Asia/Jerusalem');
    expect(through).toMatch(/^\d{4}-\d{2}$/);
    expect(isYearMonthRecognizedForActual('2026-01', through)).toBe(true);
    expect(isFutureEconomicYearMonth('2099-12', 'Asia/Jerusalem')).toBe(true);
  });

  it('excludes future economic months from Actual recognition', () => {
    const through = '2026-08';
    expect(isYearMonthRecognizedForActual('2026-08', through)).toBe(true);
    expect(isYearMonthRecognizedForActual('2026-09', through)).toBe(false);
    expect(isYearMonthRecognizedForActual('2026-10', through)).toBe(false);
    expect(isYearMonthRecognizedForActual('2026-11', through)).toBe(false);
    expect(isYearMonthRecognizedForActual('2026-12', through)).toBe(false);
  });
});
