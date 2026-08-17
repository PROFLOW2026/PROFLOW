import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertWarrantyDateOrder, deriveCoverageStatus } from '@/modules/warranty';

describe('warranty coverage dates', () => {
  it('rejects end before start', () => {
    expect(() => assertWarrantyDateOrder('2026-08-10', '2026-08-01')).toThrow(DomainRuleError);
    expect(() => assertWarrantyDateOrder('2026-08-01', '2026-08-10')).not.toThrow();
    expect(() => assertWarrantyDateOrder(null, '2026-08-10')).not.toThrow();
  });

  it('derives scheduled, active, expired and void from dates', () => {
    expect(
      deriveCoverageStatus({ startDate: '2026-09-01', endDate: '2027-09-01', today: '2026-08-17' }),
    ).toBe('scheduled');
    expect(
      deriveCoverageStatus({ startDate: '2026-01-01', endDate: '2027-01-01', today: '2026-08-17' }),
    ).toBe('active');
    expect(
      deriveCoverageStatus({ startDate: '2025-01-01', endDate: '2026-01-01', today: '2026-08-17' }),
    ).toBe('expired');
    expect(
      deriveCoverageStatus({
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        today: '2026-08-17',
        voided: true,
      }),
    ).toBe('void');
  });
});
