import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { moneyEquals } from '@/shared/money';
import { calculateLaborCostTotal } from '@/modules/workforce/domain/labor-cost';
import { resolveRateVersionForDate } from '@/modules/workforce/domain/rate-lookup';
import type { RateVersionRecord } from '@/modules/workforce/domain/types';

/**
 * Simulates entry-time snapshot behaviour (doc 04 §13, doc 06 §5):
 * cost is frozen at creation; a later rate change must not restate it.
 */
describe('time entry cost snapshot integrity', () => {
  const initialVersion: RateVersionRecord = {
    id: 'rate-v1',
    organizationId: 'org',
    employeeId: 'emp',
    validFrom: '2026-01-01',
    validTo: '2026-08-31',
    baseRate: '100',
    rateUnit: 'hourly',
    currency: 'ILS',
    burdenPercent: '20',
    correctsRateVersionId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const laterVersion: RateVersionRecord = {
    ...initialVersion,
    id: 'rate-v2',
    validFrom: '2026-09-01',
    validTo: null,
    baseRate: '150',
    burdenPercent: '25',
  };

  const allVersions = [initialVersion, laterVersion];
  const workDate = businessDate('2026-06-15');
  const hours = '8';

  it('snapshots cost using the rate in force on the work date', () => {
    const applicable = resolveRateVersionForDate(allVersions, workDate);
    expect(applicable?.id).toBe('rate-v1');

    const snapshot = calculateLaborCostTotal({
      baseRate: applicable!.baseRate,
      currency: applicable!.currency,
      rateUnit: applicable!.rateUnit,
      hours,
      burdenPercent: applicable!.burdenPercent,
    });

    expect(moneyEquals(snapshot, { amount: '960.000000', currency: 'ILS' })).toBe(true);
  });

  it('does not change a stored snapshot when a new rate version is added', () => {
    const snapshotAtEntry = calculateLaborCostTotal({
      baseRate: initialVersion.baseRate,
      currency: initialVersion.currency,
      rateUnit: initialVersion.rateUnit,
      hours,
      burdenPercent: initialVersion.burdenPercent,
    });

    const wouldBeToday = resolveRateVersionForDate(allVersions, businessDate('2026-10-01'));
    const recalculatedWithNewRate = calculateLaborCostTotal({
      baseRate: wouldBeToday!.baseRate,
      currency: wouldBeToday!.currency,
      rateUnit: wouldBeToday!.rateUnit,
      hours,
      burdenPercent: wouldBeToday!.burdenPercent,
    });

    expect(moneyEquals(snapshotAtEntry, { amount: '960.000000', currency: 'ILS' })).toBe(true);
    expect(moneyEquals(recalculatedWithNewRate, { amount: '1500.000000', currency: 'ILS' })).toBe(true);
    expect(snapshotAtEntry.amount).not.toBe(recalculatedWithNewRate.amount);
  });
});
