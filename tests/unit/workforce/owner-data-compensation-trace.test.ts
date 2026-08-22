import { describe, expect, it } from 'vitest';
import { coerceBusinessDate } from '@/shared/dates/dates';
import { resolveRateVersionForCosting, resolveRateVersionForDate } from '@/modules/workforce/domain/rate-lookup';
import type { RateVersionRecord } from '@/modules/workforce/domain/types';

describe('coerceBusinessDate', () => {
  it('accepts YYYY-MM-DD strings', () => {
    expect(coerceBusinessDate('2026-08-15')).toBe('2026-08-15');
  });

  it('strips ISO timestamp prefixes from postgres date reads', () => {
    expect(coerceBusinessDate('2026-08-15T00:00:00.000Z')).toBe('2026-08-15');
  });

  it('parses locale date strings from raw postgres reads', () => {
    expect(coerceBusinessDate('Sat Aug 22 2026 00:00:00 GMT+0000')).toBe('2026-08-22');
  });
});

describe('resolveRateVersionForCosting', () => {
  const monthlyRate: RateVersionRecord = {
    id: 'rate-1',
    organizationId: 'org',
    employeeId: 'emp',
    validFrom: '2026-08-22',
    validTo: null,
    baseRate: '7500',
    currency: 'ILS',
    rateUnit: 'monthly',
    burdenPercent: null,
    correctsRateVersionId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('uses strict effective dating when rate covers the work date', () => {
    expect(resolveRateVersionForDate([monthlyRate], '2026-08-22')?.id).toBe('rate-1');
    expect(resolveRateVersionForCosting([monthlyRate], '2026-08-22')?.id).toBe('rate-1');
  });

  it('falls back to same-month rate when salary was configured after earlier work days', () => {
    expect(resolveRateVersionForDate([monthlyRate], '2026-08-10')).toBeNull();
    expect(resolveRateVersionForCosting([monthlyRate], '2026-08-10')?.id).toBe('rate-1');
  });

  it('does not apply a future-month rate to prior-month work', () => {
    expect(resolveRateVersionForCosting([monthlyRate], '2026-07-31')).toBeNull();
  });
});
