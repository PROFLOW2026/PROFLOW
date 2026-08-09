import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  allocateByProjectWeights,
  validateAllocationSum,
} from '@/modules/expenses/domain/allocation';
import {
  isProjectEligibleInPeriod,
  selectEligibleProjects,
  type ProjectEligibilityFacts,
} from '@/modules/expenses/domain/allocation-eligibility';
import {
  aggregateSliceAllocationLines,
  assertSlicesSumToSource,
  buildAllocationSlices,
  enumerateCalendarMonthWindows,
  planSlicesWithFrozenHistory,
  splitSourceNetAcrossSlices,
  type FrozenSliceAllocation,
} from '@/modules/expenses/domain/allocation-schedule';

describe('annual monthly slicing', () => {
  it('splits insurance 24000 over a calendar year into 12 × 2000', () => {
    const sourceNet = money('24000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });

    expect(slices).toHaveLength(12);
    expect(slices[0]).toMatchObject({
      sliceIndex: 0,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      amount: expect.objectContaining({ amount: '2000.000000' }),
    });
    expect(slices[8]).toMatchObject({
      sliceIndex: 8,
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    expect(slices.every((slice) => slice.amount.amount === '2000.000000')).toBe(true);
    assertSlicesSumToSource(sourceNet, slices);
  });

  it('one_time keeps a single full-period slice', () => {
    const sourceNet = money('24000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'one_time',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    expect(slices).toHaveLength(1);
    expect(slices[0]!.amount.amount).toBe('24000.000000');
    expect(slices[0]!.periodStart).toBe('2026-01-01');
    expect(slices[0]!.periodEnd).toBe('2026-12-31');
  });

  it('monthly mode over one month yields a single slice', () => {
    const slices = buildAllocationSlices({
      sourceNet: money('3500', 'ILS'),
      scheduleMode: 'monthly',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    });
    expect(slices).toHaveLength(1);
    expect(slices[0]!.amount.amount).toBe('3500.000000');
  });
});

describe('mid-year start/end', () => {
  it('clips first/last month windows and splits evenly across overlapping months', () => {
    const windows = enumerateCalendarMonthWindows({
      start: businessDate('2026-03-15'),
      end: businessDate('2026-06-10'),
    });
    expect(windows.map((w) => [w.periodStart, w.periodEnd])).toEqual([
      ['2026-03-15', '2026-03-31'],
      ['2026-04-01', '2026-04-30'],
      ['2026-05-01', '2026-05-31'],
      ['2026-06-01', '2026-06-10'],
    ]);

    const sourceNet = money('1000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'custom',
      periodStart: '2026-03-15',
      periodEnd: '2026-06-10',
    });
    expect(slices).toHaveLength(4);
    // 1000 / 4 = 250 exactly
    expect(slices.every((s) => s.amount.amount === '250.000000')).toBe(true);
    assertSlicesSumToSource(sourceNet, slices);
  });

  it('places rounding residue on the last slice deterministically', () => {
    const amounts = splitSourceNetAcrossSlices(money('100', 'ILS'), 3);
    expect(amounts[0]!.amount).toBe('33.330000');
    expect(amounts[1]!.amount).toBe('33.330000');
    expect(amounts[2]!.amount).toBe('33.340000');
    expect(
      amounts.reduce((sum, row) => sum + Number(row.amount), 0),
    ).toBeCloseTo(100, 6);
  });
});

describe('contract weight by month', () => {
  it('allocates each monthly slice among projects eligible in that month only', () => {
    const projects: ProjectEligibilityFacts[] = [
      {
        id: 'proj-a',
        status: 'active',
        startDate: businessDate('2026-01-01'),
        actualEndDate: businessDate('2026-06-30'),
        targetEndDate: null,
        archivedAt: null,
      },
      {
        id: 'proj-b',
        status: 'active',
        startDate: businessDate('2026-07-01'),
        actualEndDate: null,
        targetEndDate: null,
        archivedAt: null,
      },
      {
        id: 'proj-c',
        status: 'active',
        startDate: businessDate('2026-01-01'),
        actualEndDate: null,
        targetEndDate: null,
        archivedAt: null,
      },
    ];

    const jan = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };
    const sep = { start: businessDate('2026-09-01'), end: businessDate('2026-09-30') };

    const janEligible = selectEligibleProjects(projects, jan).map((p) => p.id);
    const sepEligible = selectEligibleProjects(projects, sep).map((p) => p.id);

    expect(janEligible).toEqual(['proj-a', 'proj-c']);
    expect(sepEligible).toEqual(['proj-b', 'proj-c']);

    const sliceNet = money('2000', 'ILS');
    const janResult = allocateByProjectWeights({
      allocatableNet: sliceNet,
      method: 'contract_weight',
      periodStart: jan.start,
      periodEnd: jan.end,
      bases: [
        { projectId: 'proj-a', basisValue: '1000000', basisUnit: 'money' },
        { projectId: 'proj-c', basisValue: '1000000', basisUnit: 'money' },
      ],
    });
    expect(janResult.lines.map((l) => l.projectId)).toEqual(['proj-a', 'proj-c']);
    expect(janResult.lines[0]!.amount.amount).toBe('1000.000000');
    expect(janResult.lines[1]!.amount.amount).toBe('1000.000000');

    const sepResult = allocateByProjectWeights({
      allocatableNet: sliceNet,
      method: 'contract_weight',
      periodStart: sep.start,
      periodEnd: sep.end,
      bases: [
        { projectId: 'proj-b', basisValue: '600000', basisUnit: 'money' },
        { projectId: 'proj-c', basisValue: '400000', basisUnit: 'money' },
      ],
    });
    expect(sepResult.lines[0]!.amount.amount).toBe('1200.000000');
    expect(sepResult.lines[1]!.amount.amount).toBe('800.000000');

    // Mid-year project end: June-active but not September
    expect(
      isProjectEligibleInPeriod(projects[0]!, sep),
    ).toBe(false);
  });

  it('aggregates monthly contract allocations so SUM(projects)=source NET', () => {
    const sourceNet = money('4000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-28',
    });
    expect(slices).toHaveLength(2);

    const janLines = allocateByProjectWeights({
      allocatableNet: slices[0]!.amount,
      method: 'contract_weight',
      periodStart: slices[0]!.periodStart,
      periodEnd: slices[0]!.periodEnd,
      bases: [
        { projectId: 'a', basisValue: '1000000', basisUnit: 'money' },
        { projectId: 'b', basisValue: '1000000', basisUnit: 'money' },
      ],
    }).lines;

    const febLines = allocateByProjectWeights({
      allocatableNet: slices[1]!.amount,
      method: 'contract_weight',
      periodStart: slices[1]!.periodStart,
      periodEnd: slices[1]!.periodEnd,
      // Contract grew — only affects February slice
      bases: [
        { projectId: 'a', basisValue: '3000000', basisUnit: 'money' },
        { projectId: 'b', basisValue: '1000000', basisUnit: 'money' },
      ],
    }).lines;

    const rollup = aggregateSliceAllocationLines({
      sourceNet,
      sliceLines: [janLines, febLines],
      method: 'contract_weight',
    });

    validateAllocationSum(
      sourceNet,
      rollup.map((line) => line.amount),
    );
    // Jan: 1000/1000; Feb: 1500/500 → a=2500, b=1500
    expect(rollup.find((l) => l.projectId === 'a')!.amount.amount).toBe('2500.000000');
    expect(rollup.find((l) => l.projectId === 'b')!.amount.amount).toBe('1500.000000');
  });
});

describe('labor hours by month', () => {
  it('uses each month’s hours basis independently', () => {
    const jan = allocateByProjectWeights({
      allocatableNet: money('2000', 'ILS'),
      method: 'labor_hours_weight',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      bases: [
        { projectId: 'a', basisValue: '80', basisUnit: 'hours' },
        { projectId: 'b', basisValue: '20', basisUnit: 'hours' },
      ],
    });
    const feb = allocateByProjectWeights({
      allocatableNet: money('2000', 'ILS'),
      method: 'labor_hours_weight',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      bases: [
        { projectId: 'a', basisValue: '10', basisUnit: 'hours' },
        { projectId: 'b', basisValue: '90', basisUnit: 'hours' },
      ],
    });

    expect(jan.lines[0]!.amount.amount).toBe('1600.000000');
    expect(jan.lines[1]!.amount.amount).toBe('400.000000');
    expect(feb.lines[0]!.amount.amount).toBe('200.000000');
    expect(feb.lines[1]!.amount.amount).toBe('1800.000000');

    const rollup = aggregateSliceAllocationLines({
      sourceNet: money('4000', 'ILS'),
      sliceLines: [jan.lines, feb.lines],
      method: 'labor_hours_weight',
    });
    validateAllocationSum(
      money('4000', 'ILS'),
      rollup.map((l) => l.amount),
    );
    expect(rollup.find((l) => l.projectId === 'a')!.amount.amount).toBe('1800.000000');
    expect(rollup.find((l) => l.projectId === 'b')!.amount.amount).toBe('2200.000000');
  });
});

describe('historical immutability', () => {
  it('keeps applied January frozen when September bases change', () => {
    const sourceNet = money('4000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-02-28',
    });

    const janLines = allocateByProjectWeights({
      allocatableNet: slices[0]!.amount,
      method: 'contract_weight',
      periodStart: slices[0]!.periodStart,
      periodEnd: slices[0]!.periodEnd,
      bases: [
        { projectId: 'a', basisValue: '1', basisUnit: 'money' },
        { projectId: 'b', basisValue: '1', basisUnit: 'money' },
      ],
    }).lines;

    const frozenJan: FrozenSliceAllocation = {
      sliceIndex: 0,
      periodStart: slices[0]!.periodStart,
      periodEnd: slices[0]!.periodEnd,
      amount: slices[0]!.amount,
      lines: janLines,
      method: 'contract_weight',
      totalBasis: '2.000000',
      basisUnit: 'money',
      eligibleProjectIds: ['a', 'b'],
    };

    const plan = planSlicesWithFrozenHistory({
      slices,
      frozen: [frozenJan],
    });

    expect(plan.reusable).toHaveLength(1);
    expect(plan.reusable[0]!.lines[0]!.amount.amount).toBe('1000.000000');
    expect(plan.pending.map((s) => s.sliceIndex)).toEqual([1]);

    // Live bases changed drastically — frozen January still reused as-is
    const febLines = allocateByProjectWeights({
      allocatableNet: plan.pending[0]!.amount,
      method: 'contract_weight',
      periodStart: plan.pending[0]!.periodStart,
      periodEnd: plan.pending[0]!.periodEnd,
      bases: [
        { projectId: 'a', basisValue: '99', basisUnit: 'money' },
        { projectId: 'b', basisValue: '1', basisUnit: 'money' },
      ],
    }).lines;

    const rollup = aggregateSliceAllocationLines({
      sourceNet,
      sliceLines: [plan.reusable[0]!.lines, febLines],
      method: 'contract_weight',
    });

    // January half still 1000/1000, not rewritten by new 99:1 weights
    expect(plan.reusable[0]!.lines[0]!.amount.amount).toBe('1000.000000');
    expect(plan.reusable[0]!.lines[1]!.amount.amount).toBe('1000.000000');
    validateAllocationSum(
      sourceNet,
      rollup.map((l) => l.amount),
    );
  });

  it('recomputes a slice when period bounds or amount no longer match', () => {
    const slices = buildAllocationSlices({
      sourceNet: money('24000', 'ILS'),
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });

    const stale: FrozenSliceAllocation = {
      sliceIndex: 0,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      amount: money('1500', 'ILS'), // no longer matches 2000 slice
      lines: [],
      method: 'contract_weight',
      totalBasis: '1',
      basisUnit: 'money',
      eligibleProjectIds: [],
    };

    const plan = planSlicesWithFrozenHistory({ slices, frozen: [stale] });
    expect(plan.reusable).toHaveLength(0);
    expect(plan.pending).toHaveLength(12);
  });
});

describe('rounding invariants', () => {
  it('SUM(slices)=source NET for awkward annual amounts', () => {
    const sourceNet = money('10000', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'annual',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    assertSlicesSumToSource(sourceNet, slices);
    // 10000/12 = 833.33… → residue on December
    expect(slices[0]!.amount.amount).toBe('833.330000');
    expect(slices[11]!.amount.amount).toBe('833.370000');
  });

  it('SUM(project allocations)=source NET after multi-slice rollup', () => {
    const sourceNet = money('100', 'ILS');
    const slices = buildAllocationSlices({
      sourceNet,
      scheduleMode: 'monthly',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
    });

    const sliceLines = slices.map((slice) =>
      allocateByProjectWeights({
        allocatableNet: slice.amount,
        method: 'equal_split',
        periodStart: slice.periodStart,
        periodEnd: slice.periodEnd,
        bases: [
          { projectId: 'z', basisValue: '1', basisUnit: 'count' },
          { projectId: 'a', basisValue: '1', basisUnit: 'count' },
          { projectId: 'm', basisValue: '1', basisUnit: 'count' },
        ],
      }).lines,
    );

    const rollup = aggregateSliceAllocationLines({
      sourceNet,
      sliceLines,
      method: 'equal_split',
    });

    validateAllocationSum(
      sourceNet,
      rollup.map((l) => l.amount),
    );
  });
});
