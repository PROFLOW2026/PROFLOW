import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { allocateByProjectWeights, validateAllocationSum } from '@/modules/expenses/domain/allocation';
import {
  activeDayExposurePolicyForMethod,
  applyActiveDayExposureToBases,
  countInclusiveDays,
  projectActiveDaysInSlice,
  projectActiveFractionOfSlice,
  type ProjectEligibilityFacts,
} from '@/modules/expenses/domain/allocation-eligibility';
import { buildAllocationSlices, assertSlicesSumToSource } from '@/modules/expenses/domain/allocation-schedule';

function project(
  id: string,
  start: string | null,
  end: string | null,
): ProjectEligibilityFacts {
  return {
    id,
    status: 'active',
    startDate: start ? businessDate(start) : null,
    actualEndDate: end ? businessDate(end) : null,
    targetEndDate: null,
    archivedAt: null,
  };
}

describe('inclusive day counting', () => {
  it('counts full 31-day January', () => {
    expect(countInclusiveDays(businessDate('2026-01-01'), businessDate('2026-01-31'))).toBe(31);
  });

  it('counts 30-day April', () => {
    expect(countInclusiveDays(businessDate('2026-04-01'), businessDate('2026-04-30'))).toBe(30);
  });

  it('counts non-leap February 2026 as 28 days', () => {
    expect(countInclusiveDays(businessDate('2026-02-01'), businessDate('2026-02-28'))).toBe(28);
  });

  it('counts leap February 2028 as 29 days', () => {
    expect(countInclusiveDays(businessDate('2028-02-01'), businessDate('2028-02-29'))).toBe(29);
  });

  it('counts a single day as 1', () => {
    expect(countInclusiveDays(businessDate('2026-01-15'), businessDate('2026-01-15'))).toBe(1);
  });
});

describe('project active days in slice', () => {
  const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };

  it('full month project has 31 active days', () => {
    const a = project('a', '2026-01-01', '2026-01-31');
    expect(projectActiveDaysInSlice(a, jan)).toBe(31);
    expect(projectActiveFractionOfSlice(a, jan)).toBe(1);
  });

  it('starts first day of month', () => {
    expect(projectActiveDaysInSlice(project('a', '2026-01-01', null), jan)).toBe(31);
  });

  it('starts last day of month', () => {
    expect(projectActiveDaysInSlice(project('b', '2026-01-31', null), jan)).toBe(1);
  });

  it('ends first day of month', () => {
    expect(projectActiveDaysInSlice(project('c', '2025-12-01', '2026-01-01'), jan)).toBe(1);
  });

  it('ends last day of month', () => {
    expect(projectActiveDaysInSlice(project('d', '2025-12-01', '2026-01-31'), jan)).toBe(31);
  });

  it('starts mid-month (Jan 28 → 4 days)', () => {
    expect(projectActiveDaysInSlice(project('b', '2026-01-28', null), jan)).toBe(4);
    expect(projectActiveFractionOfSlice(project('b', '2026-01-28', null), jan)).toBeCloseTo(4 / 31, 10);
  });

  it('ends mid-month', () => {
    expect(projectActiveDaysInSlice(project('e', '2026-01-01', '2026-01-10'), jan)).toBe(10);
  });

  it('custom mid-month slice window clips both ends', () => {
    const slice = { start: businessDate('2026-03-15'), end: businessDate('2026-03-31') };
    expect(countInclusiveDays(slice.start, slice.end)).toBe(17);
    expect(projectActiveDaysInSlice(project('p', '2026-03-01', '2026-03-20'), slice)).toBe(6);
    expect(projectActiveDaysInSlice(project('q', '2026-03-25', null), slice)).toBe(7);
  });
});

describe('active-day exposure policies', () => {
  it('multiplies contract_weight and equal_split; labor/direct are inherent', () => {
    expect(activeDayExposurePolicyForMethod('contract_weight')).toBe('multiply');
    expect(activeDayExposurePolicyForMethod('equal_split')).toBe('multiply');
    expect(activeDayExposurePolicyForMethod('labor_hours_weight')).toBe('inherent');
    expect(activeDayExposurePolicyForMethod('direct_cost_weight')).toBe('inherent');
  });

  it('does not alter labor_hours bases (inherent activity)', () => {
    const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };
    const projects = [project('a', '2026-01-01', null), project('b', '2026-01-28', null)];
    const bases = [
      { projectId: 'a', basisValue: '100', basisUnit: 'hours' as const },
      { projectId: 'b', basisValue: '10', basisUnit: 'hours' as const },
    ];
    expect(
      applyActiveDayExposureToBases({
        method: 'labor_hours_weight',
        slice: jan,
        projects,
        bases,
      }),
    ).toEqual(bases);
  });

  it('does not alter direct_cost bases (inherent activity)', () => {
    const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };
    const bases = [{ projectId: 'a', basisValue: '5000', basisUnit: 'money' as const }];
    expect(
      applyActiveDayExposureToBases({
        method: 'direct_cost_weight',
        slice: jan,
        projects: [project('a', '2026-01-28', null)],
        bases,
      }),
    ).toEqual(bases);
  });
});

describe('partial-month contract_weight (owner example)', () => {
  it('Jan 2000: full-month A vs B starting Jan 28 share by contract×activeFraction', () => {
    const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };
    const projects = [
      project('proj-a', '2026-01-01', '2026-01-31'),
      project('proj-b', '2026-01-28', null),
    ];
    const bases = applyActiveDayExposureToBases({
      method: 'contract_weight',
      slice: jan,
      projects,
      bases: [
        { projectId: 'proj-a', basisValue: '1000000', basisUnit: 'money' },
        { projectId: 'proj-b', basisValue: '1000000', basisUnit: 'money' },
      ],
    });

    // A: 1e6 * 31/31 = 1e6; B: 1e6 * 4/31
    expect(bases[0]!.basisValue).toBe('1000000.000000');
    expect(Number(bases[1]!.basisValue)).toBeCloseTo(1_000_000 * (4 / 31), 5);

    const result = allocateByProjectWeights({
      allocatableNet: money('2000', 'ILS'),
      method: 'contract_weight',
      periodStart: jan.start,
      periodEnd: jan.end,
      bases,
    });

    validateAllocationSum(
      money('2000', 'ILS'),
      result.lines.map((line) => line.amount),
    );

    const amountA = Number(result.lines.find((l) => l.projectId === 'proj-a')!.amount.amount);
    const amountB = Number(result.lines.find((l) => l.projectId === 'proj-b')!.amount.amount);
    // A should get ~31/35 of 2000, B ~4/35
    expect(amountA).toBeCloseTo((2000 * 31) / 35, 2);
    expect(amountB).toBeCloseTo((2000 * 4) / 35, 2);
    expect(amountA + amountB).toBeCloseTo(2000, 6);
    expect(amountA).toBeGreaterThan(amountB * 5);
  });
});

describe('partial-month equal_split', () => {
  it('weights by active days, not equal project heads', () => {
    const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };
    const projects = [
      project('proj-a', '2026-01-01', null),
      project('proj-b', '2026-01-28', null),
    ];
    const bases = applyActiveDayExposureToBases({
      method: 'equal_split',
      slice: jan,
      projects,
      bases: [
        { projectId: 'proj-a', basisValue: '1', basisUnit: 'count' },
        { projectId: 'proj-b', basisValue: '1', basisUnit: 'count' },
      ],
    });
    expect(bases.find((b) => b.projectId === 'proj-a')!.basisValue).toBe('31');
    expect(bases.find((b) => b.projectId === 'proj-b')!.basisValue).toBe('4');

    const result = allocateByProjectWeights({
      allocatableNet: money('2000', 'ILS'),
      method: 'equal_split',
      periodStart: jan.start,
      periodEnd: jan.end,
      bases,
    });
    validateAllocationSum(
      money('2000', 'ILS'),
      result.lines.map((line) => line.amount),
    );
    const a = Number(result.lines.find((l) => l.projectId === 'proj-a')!.amount.amount);
    const b = Number(result.lines.find((l) => l.projectId === 'proj-b')!.amount.amount);
    expect(a).toBeCloseTo((2000 * 31) / 35, 2);
    expect(b).toBeCloseTo((2000 * 4) / 35, 2);
  });
});

describe('annual slices still reconcile after partial-month weights', () => {
  it('SUM(monthly slices)=source NET and January partial allocation sums to slice', () => {
    const sourceNet = money('24000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    assertSlicesSumToSource(sourceNet, slices);

    const jan = slices[0]!;
    const projects = [
      project('a', '2026-01-01', null),
      project('b', '2026-01-28', null),
    ];
    const bases = applyActiveDayExposureToBases({
      method: 'contract_weight',
      slice: { start: jan.periodStart, end: jan.periodEnd },
      projects,
      bases: [
        { projectId: 'a', basisValue: '1000000', basisUnit: 'money' },
        { projectId: 'b', basisValue: '1000000', basisUnit: 'money' },
      ],
    });
    const lines = allocateByProjectWeights({
      allocatableNet: jan.amount,
      method: 'contract_weight',
      periodStart: jan.periodStart,
      periodEnd: jan.periodEnd,
      bases,
    }).lines;
    validateAllocationSum(
      jan.amount,
      lines.map((line) => line.amount),
    );
  });
});
