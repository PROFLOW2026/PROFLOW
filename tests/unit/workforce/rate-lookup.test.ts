import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { resolveRateVersionForDate } from '@/modules/workforce/domain/rate-lookup';
import type { RateVersionRecord } from '@/modules/workforce/domain/types';

function version(
  id: string,
  validFrom: string,
  validTo: string | null,
  baseRate = '100',
): RateVersionRecord {
  return {
    id,
    organizationId: 'org-1',
    employeeId: 'emp-1',
    validFrom,
    validTo,
    baseRate,
    rateUnit: 'hourly',
    currency: 'ILS',
    burdenPercent: null,
    correctsRateVersionId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('resolveRateVersionForDate', () => {
  const versions = [
    version('v1', '2026-01-01', '2026-06-30', '100'),
    version('v2', '2026-07-01', '2026-08-31', '125'),
    version('v3', '2026-09-01', null, '140'),
  ];

  it('includes the first day a rate starts', () => {
    expect(resolveRateVersionForDate(versions, businessDate('2026-07-01'))?.id).toBe('v2');
  });

  it('includes the last day a rate ends', () => {
    expect(resolveRateVersionForDate(versions, businessDate('2026-08-31'))?.id).toBe('v2');
  });

  it('excludes the day after a closed range ends', () => {
    expect(resolveRateVersionForDate(versions, businessDate('2026-09-01'))?.id).toBe('v3');
    expect(resolveRateVersionForDate(versions, businessDate('2026-06-30'))?.id).toBe('v1');
    expect(resolveRateVersionForDate(versions, businessDate('2026-07-01'))?.id).toBe('v2');
  });

  it('treats open-ended current version as in force on future dates', () => {
    expect(resolveRateVersionForDate(versions, businessDate('2027-12-31'))?.id).toBe('v3');
  });

  it('returns null when no version covers the date (gap)', () => {
    const gapped = [
      version('a', '2026-01-01', '2026-03-31'),
      version('b', '2026-05-01', null),
    ];
    expect(resolveRateVersionForDate(gapped, businessDate('2026-04-15'))).toBeNull();
  });

  it('picks the latest validFrom when ranges overlap on the same day', () => {
    const overlapping = [
      version('old', '2026-01-01', null, '100'),
      version('new', '2026-06-01', null, '150'),
    ];
    expect(resolveRateVersionForDate(overlapping, businessDate('2026-06-01'))?.baseRate).toBe('150');
  });
});
