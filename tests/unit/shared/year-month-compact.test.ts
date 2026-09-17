import { describe, expect, it } from 'vitest';
import { reportPreviewPath } from '@/modules/reports/domain/paths';
import {
  formatYearMonthCompact,
  isYearMonth,
  listMonthSelectOptions,
  parseYearMonth,
  yearMonthFromParts,
} from '@/shared/dates/year-month';

describe('year-month compact display', () => {
  it('formats 2026-09 as 9/26', () => {
    expect(formatYearMonthCompact('2026-09')).toBe('9/26');
  });

  it('formats 2026-01 as 1/26', () => {
    expect(formatYearMonthCompact('2026-01')).toBe('1/26');
  });

  it('formats 2024-01 as 1/24', () => {
    expect(formatYearMonthCompact('2024-01')).toBe('1/24');
  });

  it('builds canonical YYYY-MM from month/year parts without year limits', () => {
    expect(yearMonthFromParts(2026, 9)).toBe('2026-09');
    expect(yearMonthFromParts(2024, 1)).toBe('2024-01');
    expect(yearMonthFromParts(1998, 12)).toBe('1998-12');
    expect(yearMonthFromParts(2035, 3)).toBe('2035-03');
    expect(parseYearMonth('2026-09')).toEqual({ year: 2026, month: 9 });
    expect(isYearMonth('2026-09')).toBe(true);
    expect(listMonthSelectOptions()).toHaveLength(12);
    expect(listMonthSelectOptions()[8]).toEqual({ value: '9', label: '9' });
  });

  it('builds monthly workforce report preview URL from compact selection', () => {
    const month = '2026-09';
    expect(reportPreviewPath('monthly_workforce_report', month)).toBe(
      '/reports/preview?kind=monthly_workforce_report&id=2026-09',
    );
  });
});
