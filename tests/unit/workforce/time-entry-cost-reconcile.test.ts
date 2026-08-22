import { describe, expect, it } from 'vitest';
import {
  entryNeedsCostSnapshotReconcile,
  resolvePreloadedTimeEntryCost,
  shouldApplyReconcileSnapshot,
} from '@/modules/workforce/application/time-entry-cost-reconcile';
import { resolveWorkCalendarRatesForCosting } from '@/modules/workforce/domain/work-calendar';
import type { RateVersionRecord } from '@/modules/workforce/domain/types';

const monthlyRate: RateVersionRecord = {
  id: 'rate-monthly',
  organizationId: 'org',
  employeeId: 'emp',
  validFrom: '2026-01-01',
  validTo: null,
  baseRate: '7500',
  rateUnit: 'monthly',
  currency: 'ILS',
  burdenPercent: null,
  correctsRateVersionId: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('time-entry cost reconcile planner', () => {
  const configured = resolveWorkCalendarRatesForCosting({
    org: { standardHoursPerDay: '8', workingDaysPerMonth: '22.75' },
  });
  const calendar = configured.configured ? configured.rates : null;

  it('needs reconcile when cost or rate_version_id is null', () => {
    expect(
      entryNeedsCostSnapshotReconcile({ costAmount: null, rateVersionId: null }),
    ).toBe(true);
    expect(
      entryNeedsCostSnapshotReconcile({ costAmount: '10', rateVersionId: null }),
    ).toBe(true);
    expect(
      entryNeedsCostSnapshotReconcile({ costAmount: null, rateVersionId: 'rv' }),
    ).toBe(true);
    expect(
      entryNeedsCostSnapshotReconcile({ costAmount: '10', rateVersionId: 'rv' }),
    ).toBe(false);
  });

  it('monthly rate does not fill entry snapshots (monthly_allocation path)', () => {
    const resolution = resolvePreloadedTimeEntryCost({
      hours: '8',
      workDate: '2026-08-10',
      calendar,
      versions: [monthlyRate],
      componentsByRateId: new Map(),
      monthlyEmployerCostByYearMonth: new Map(),
    });

    expect(resolution.kind).toBe('monthly_allocation');
    expect(resolution.rateVersionId).toBe('rate-monthly');
    expect(resolution.costAmount).toBeNull();
    expect(
      shouldApplyReconcileSnapshot(
        { costAmount: null, rateVersionId: null },
        resolution,
      ),
    ).toBe(false);
  });

  it('monthly rate still skips snapshot fill when calendar missing', () => {
    const resolution = resolvePreloadedTimeEntryCost({
      hours: '8',
      workDate: '2026-08-10',
      calendar: null,
      versions: [monthlyRate],
      componentsByRateId: new Map(),
      monthlyEmployerCostByYearMonth: new Map(),
    });

    expect(resolution.kind).toBe('monthly_allocation');
    expect(resolution.rateVersionId).toBe('rate-monthly');
    expect(resolution.costAmount).toBeNull();
    expect(
      shouldApplyReconcileSnapshot(
        { costAmount: null, rateVersionId: null },
        resolution,
      ),
    ).toBe(false);
  });

  it('does not rate-only backfill monthly rows via snapshot reconcile', () => {
    const resolution = resolvePreloadedTimeEntryCost({
      hours: '8',
      workDate: '2026-08-10',
      calendar,
      versions: [monthlyRate],
      componentsByRateId: new Map(),
      monthlyEmployerCostByYearMonth: new Map(),
    });

    expect(
      shouldApplyReconcileSnapshot(
        { costAmount: '100.000000', rateVersionId: null },
        resolution,
      ),
    ).toBe(false);
  });
});
