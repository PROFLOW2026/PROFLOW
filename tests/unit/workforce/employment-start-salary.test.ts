import { describe, expect, it } from 'vitest';
import {
  canRealignInitialCompensationValidFrom,
  planEmployeeSalarySave,
  resolveInitialCompensationValidFrom,
} from '@/modules/workforce/domain/employment-compensation';
import {
  resolveCurrentCompensationForDisplay,
  resolveRateVersionForDate,
} from '@/modules/workforce/domain/rate-lookup';
import type { RateVersionRecord } from '@/modules/workforce/domain/types';

function rate(partial: Partial<RateVersionRecord> & Pick<RateVersionRecord, 'id' | 'validFrom'>): RateVersionRecord {
  return {
    organizationId: 'org',
    employeeId: 'emp',
    validTo: null,
    baseRate: '7500',
    currency: 'ILS',
    rateUnit: 'monthly',
    burdenPercent: null,
    correctsRateVersionId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('employment start → initial salary effective date', () => {
  it('uses hireDate as initial compensation validFrom', () => {
    expect(
      resolveInitialCompensationValidFrom({
        hireDate: '2026-08-01',
        explicitValidFrom: '2026-08-22',
      }),
    ).toBe('2026-08-01');
  });

  it('requires hireDate for salary create (no inventing create-day)', () => {
    expect(
      resolveInitialCompensationValidFrom({
        hireDate: null,
        explicitValidFrom: '2026-08-22',
      }),
    ).toBe('2026-08-22');
  });

  it('allows realigning a single open initial salary to hireDate', () => {
    const result = canRealignInitialCompensationValidFrom(
      [rate({ id: 'r1', validFrom: '2026-08-22' })],
      '2026-08-01' as never,
    );
    expect(result).toEqual({
      rateVersionId: 'r1',
      previousValidFrom: '2026-08-22',
    });
  });

  it('does not realign when salary-change history already exists', () => {
    expect(
      canRealignInitialCompensationValidFrom(
        [
          rate({ id: 'r1', validFrom: '2026-08-01', validTo: '2026-12-31' }),
          rate({ id: 'r2', validFrom: '2027-01-01', baseRate: '8500' }),
        ],
        '2026-07-01' as never,
      ),
    ).toBeNull();
  });

  it('salary change preserves historical rate by work date', () => {
    const history = [
      rate({ id: 'old', validFrom: '2026-08-01', validTo: '2026-12-31', baseRate: '7500' }),
      rate({ id: 'new', validFrom: '2027-01-01', baseRate: '8500' }),
    ];
    expect(resolveRateVersionForDate(history, '2026-09-15')?.baseRate).toBe('7500');
    expect(resolveRateVersionForDate(history, '2027-01-01')?.baseRate).toBe('8500');
  });
});

describe('Owner admin salary save plan', () => {
  it('allows retroactive correction of open salary effective date (Mohammad case)', () => {
    const plan = planEmployeeSalarySave({
      versions: [rate({ id: 'open', validFrom: '2026-08-22', baseRate: '7500' })],
      validFrom: '2026-08-01',
    });
    expect(plan).toEqual({
      kind: 'correct_open',
      openRateVersionId: 'open',
      priorRateVersionId: null,
      priorNewValidTo: null,
      supersedeRateVersionIds: [],
    });
  });

  it('allows same-day amount correction on open salary', () => {
    const plan = planEmployeeSalarySave({
      versions: [rate({ id: 'open', validFrom: '2026-08-22' })],
      validFrom: '2026-08-22',
    });
    expect(plan.kind).toBe('correct_open');
  });

  it('plans forward raise by closing open then inserting', () => {
    const plan = planEmployeeSalarySave({
      versions: [rate({ id: 'open', validFrom: '2026-01-01', baseRate: '7500' })],
      validFrom: '2026-07-01',
    });
    expect(plan).toEqual({
      kind: 'forward_change',
      openRateVersionId: 'open',
      closeValidTo: '2026-06-30',
    });
  });

  it('corrects open start earlier and truncates prior period boundary', () => {
    const plan = planEmployeeSalarySave({
      versions: [
        rate({ id: 'prior', validFrom: '2026-01-01', validTo: '2026-06-30', baseRate: '7500' }),
        rate({ id: 'open', validFrom: '2026-07-01', baseRate: '8500' }),
      ],
      validFrom: '2026-06-01',
    });
    expect(plan).toEqual({
      kind: 'correct_open',
      openRateVersionId: 'open',
      priorRateVersionId: 'prior',
      priorNewValidTo: '2026-05-31',
      supersedeRateVersionIds: [],
    });
  });

  it('keeps periods before selected effective date when resolving history', () => {
    const history = [
      rate({ id: 'prior', validFrom: '2026-01-01', validTo: '2026-05-31', baseRate: '7500' }),
      rate({ id: 'open', validFrom: '2026-06-01', baseRate: '8500' }),
    ];
    expect(resolveRateVersionForDate(history, '2026-05-15')?.baseRate).toBe('7500');
    expect(resolveRateVersionForDate(history, '2026-06-01')?.baseRate).toBe('8500');
  });

  it('shows configured open salary on list/detail even before asOf covers validFrom', () => {
    const versions = [rate({ id: 'open', validFrom: '2026-08-22', baseRate: '7500' })];
    expect(resolveRateVersionForDate(versions, '2026-08-21')).toBeNull();
    expect(resolveCurrentCompensationForDisplay(versions, '2026-08-21')?.baseRate).toBe('7500');
  });
});
