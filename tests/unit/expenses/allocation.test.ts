import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  allocateByProjectWeights,
  equalSplitBases,
  resolveAllocationLines,
  validateAllocationSum,
} from '@/modules/expenses/domain/allocation';
import {
  isProjectEligibleInPeriod,
  selectEligibleProjects,
} from '@/modules/expenses/domain/allocation-eligibility';
import {
  classifyExpenseCost,
  resolveAllocationMethodPolicy,
} from '@/modules/expenses/domain/allocation-policy';

describe('expense allocation (manual)', () => {
  const total = money('1000', 'ILS');

  it('accepts manual amount lines that sum exactly to the total', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_amount',
        amount: '600',
        sortOrder: 0,
      },
      {
        targetType: 'project',
        projectId: 'p2',
        method: 'manual_amount',
        amount: '400',
        sortOrder: 1,
      },
    ]);

    expect(lines).toHaveLength(2);
    expect(lines[0]!.amount.amount).toBe('600.000000');
    expect(lines[1]!.amount.amount).toBe('400.000000');
    expect(lines[0]!.amountBasis).toBe('gross');
  });

  it('resolves percentage lines with rounding residue on the last line', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '33.33',
        sortOrder: 0,
      },
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '33.33',
        sortOrder: 1,
      },
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_percent',
        percent: '33.34',
        sortOrder: 2,
      },
    ]);

    validateAllocationSum(
      total,
      lines.map((line) => line.amount),
    );
  });

  it('rejects allocations that do not sum to the expense total', () => {
    expect(() =>
      resolveAllocationLines(total, [
        {
          targetType: 'overhead',
          method: 'manual_amount',
          amount: '500',
          sortOrder: 0,
        },
      ]),
    ).toThrow(DomainRuleError);
  });

  it('supports mixed amount and percent methods', () => {
    const lines = resolveAllocationLines(total, [
      {
        targetType: 'project',
        projectId: 'p1',
        method: 'manual_amount',
        amount: '700',
        sortOrder: 0,
      },
      {
        targetType: 'overhead',
        method: 'manual_percent',
        percent: '30',
        sortOrder: 1,
      },
    ]);

    expect(lines).toHaveLength(2);
    validateAllocationSum(
      total,
      lines.map((line) => line.amount),
    );
  });
});

describe('automatic weight allocation', () => {
  it('allocates insurance 24k by contract weight 1M/600k/400k → 12k/7.2k/4.8k', () => {
    const allocatableNet = money('24000', 'ILS');
    const { lines, explanation } = allocateByProjectWeights({
      allocatableNet,
      method: 'contract_weight',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      bases: [
        { projectId: 'proj-a', basisValue: '1000000', basisUnit: 'money' },
        { projectId: 'proj-b', basisValue: '600000', basisUnit: 'money' },
        { projectId: 'proj-c', basisValue: '400000', basisUnit: 'money' },
      ],
    });

    expect(lines.map((l) => l.projectId)).toEqual(['proj-a', 'proj-b', 'proj-c']);
    expect(lines[0]!.amount.amount).toBe('12000.000000');
    expect(lines[1]!.amount.amount).toBe('7200.000000');
    expect(lines[2]!.amount.amount).toBe('4800.000000');
    expect(lines[0]!.percent).toBe('50.0000');
    expect(lines[1]!.percent).toBe('30.0000');
    expect(lines[2]!.percent).toBe('20.0000');
    expect(lines.every((l) => l.amountBasis === 'net')).toBe(true);
    expect(lines.every((l) => l.method === 'contract_weight')).toBe(true);
    validateAllocationSum(
      allocatableNet,
      lines.map((l) => l.amount),
    );
    expect(explanation.totalBasis).toBe('2000000.000000');
    expect(explanation.eligibleProjectIds).toHaveLength(3);
  });

  it('places rounding residue on the last project deterministically', () => {
    const allocatableNet = money('100', 'ILS');
    const { lines } = allocateByProjectWeights({
      allocatableNet,
      method: 'contract_weight',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      bases: [
        { projectId: 'z', basisValue: '1', basisUnit: 'money' },
        { projectId: 'a', basisValue: '1', basisUnit: 'money' },
        { projectId: 'm', basisValue: '1', basisUnit: 'money' },
      ],
    });

    // Sorted by projectId: a, m, z - residue on z
    expect(lines.map((l) => l.projectId)).toEqual(['a', 'm', 'z']);
    validateAllocationSum(
      allocatableNet,
      lines.map((l) => l.amount),
    );
    const sumFirstTwo =
      Number(lines[0]!.amount.amount) + Number(lines[1]!.amount.amount);
    expect(Number(lines[2]!.amount.amount)).toBeCloseTo(100 - sumFirstTwo, 6);
  });

  it('equal_split requires unit bases and splits evenly', () => {
    const allocatableNet = money('9000', 'ILS');
    const { lines } = allocateByProjectWeights({
      allocatableNet,
      method: 'equal_split',
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      bases: equalSplitBases(['p2', 'p1', 'p3']),
    });

    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.amount.amount === '3000.000000')).toBe(true);
  });

  it('labor_hours_weight follows hours bases', () => {
    const allocatableNet = money('10000', 'ILS');
    const { lines } = allocateByProjectWeights({
      allocatableNet,
      method: 'labor_hours_weight',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
      bases: [
        { projectId: 'a', basisValue: '80', basisUnit: 'hours' },
        { projectId: 'b', basisValue: '20', basisUnit: 'hours' },
      ],
    });

    expect(lines[0]!.amount.amount).toBe('8000.000000');
    expect(lines[1]!.amount.amount).toBe('2000.000000');
  });

  it('rejects zero total basis', () => {
    expect(() =>
      allocateByProjectWeights({
        allocatableNet: money('1000', 'ILS'),
        method: 'direct_cost_weight',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        bases: [{ projectId: 'a', basisValue: '0', basisUnit: 'money' }],
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects weight methods via resolveAllocationLines', () => {
    expect(() =>
      resolveAllocationLines(money('100', 'ILS'), [
        {
          targetType: 'project',
          projectId: 'p1',
          method: 'contract_weight',
          sortOrder: 0,
        },
      ]),
    ).toThrow(DomainRuleError);
  });
});

describe('allocation eligibility', () => {
  const period = { start: businessDate('2026-01-01'), end: businessDate('2026-01-31') };

  it('includes mid-period starts and ends', () => {
    expect(
      isProjectEligibleInPeriod(
        {
          id: '1',
          status: 'active',
          startDate: businessDate('2026-01-15'),
          actualEndDate: null,
          targetEndDate: null,
          archivedAt: null,
        },
        period,
      ),
    ).toBe(true);

    expect(
      isProjectEligibleInPeriod(
        {
          id: '2',
          status: 'completed',
          startDate: businessDate('2025-06-01'),
          actualEndDate: businessDate('2026-01-10'),
          targetEndDate: null,
          archivedAt: null,
        },
        period,
      ),
    ).toBe(true);
  });

  it('excludes projects that ended before the period or start after', () => {
    expect(
      isProjectEligibleInPeriod(
        {
          id: '3',
          status: 'completed',
          startDate: businessDate('2025-01-01'),
          actualEndDate: businessDate('2025-12-31'),
          targetEndDate: null,
          archivedAt: null,
        },
        period,
      ),
    ).toBe(false);

    expect(
      isProjectEligibleInPeriod(
        {
          id: '4',
          status: 'active',
          startDate: businessDate('2026-02-01'),
          actualEndDate: null,
          targetEndDate: null,
          archivedAt: null,
        },
        period,
      ),
    ).toBe(false);
  });

  it('excludes draft/cancelled/archived', () => {
    expect(
      isProjectEligibleInPeriod(
        {
          id: '5',
          status: 'draft',
          startDate: null,
          actualEndDate: null,
          targetEndDate: null,
          archivedAt: null,
        },
        period,
      ),
    ).toBe(false);
  });

  it('honors explicit project id filter', () => {
    const selected = selectEligibleProjects(
      [
        {
          id: 'a',
          status: 'active',
          startDate: null,
          actualEndDate: null,
          targetEndDate: null,
          archivedAt: null,
        },
        {
          id: 'b',
          status: 'active',
          startDate: null,
          actualEndDate: null,
          targetEndDate: null,
          archivedAt: null,
        },
      ],
      period,
      ['b'],
    );
    expect(selected.map((p) => p.id)).toEqual(['b']);
  });
});

describe('allocation policy', () => {
  it('classifies DIRECT / SHARED / OVERHEAD', () => {
    expect(classifyExpenseCost('direct_project', true)).toBe('DIRECT');
    expect(classifyExpenseCost('shared', false)).toBe('SHARED');
    expect(classifyExpenseCost('business_overhead', false)).toBe('OVERHEAD');
  });

  it('prefers explicit method over category and org defaults', () => {
    expect(
      resolveAllocationMethodPolicy({
        explicitMethod: 'labor_hours_weight',
        categoryDefaultMethod: 'contract_weight',
        organizationDefaultMethod: 'equal_split',
      }),
    ).toBe('labor_hours_weight');

    expect(
      resolveAllocationMethodPolicy({
        explicitMethod: null,
        categoryDefaultMethod: 'contract_weight',
        organizationDefaultMethod: 'equal_split',
      }),
    ).toBe('contract_weight');
  });
});
