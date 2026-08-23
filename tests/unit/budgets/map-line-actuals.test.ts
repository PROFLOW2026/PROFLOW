import { describe, expect, it } from 'vitest';
import {
  emptyCostPosition,
  withCommittedAndApPayable,
  type ProjectExpenseContribution,
} from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';
import {
  mapBudgetLineActuals,
  UNMAPPED_REMAINDER_ROW_ID,
} from '@/modules/budgets/domain/map-line-actuals';
import type { BudgetLineType, ProjectBudgetLineRecord } from '@/modules/budgets/domain/types';

const ILS = 'ILS';

function line(
  overrides: Partial<ProjectBudgetLineRecord> & {
    readonly id: string;
    readonly lineType: BudgetLineType;
    readonly label: string;
    readonly budgetAmount: string;
  },
): ProjectBudgetLineRecord {
  return {
    organizationId: 'o',
    budgetId: 'b',
    revisionNumber: 1,
    categoryKey: null,
    workPackageId: null,
    disciplineKey: null,
    costCode: null,
    costCodeId: null,
    etcAmount: null,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function contribution(
  overrides: Partial<ProjectExpenseContribution> & { readonly amount: string },
): ProjectExpenseContribution {
  return {
    currency: ILS,
    costFamily: 'direct_project',
    isDirectOnProject: true,
    isAllocated: false,
    isSubcontractor: false,
    ...overrides,
  };
}

function engineCost(actual: string, committed = '0', etc = '0') {
  return withCommittedAndApPayable(
    {
      ...emptyCostPosition(ILS),
      actualCostToDate: money(actual, ILS),
      estimatedFinalCost: money(actual, ILS),
    },
    money(committed, ILS),
    zeroMoney(ILS),
    money(etc, ILS),
  );
}

describe('mapBudgetLineActuals', () => {
  it('maps category lines from matching contribution categoryKey only', () => {
    const cost = engineCost('100000');
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost,
      contributions: [
        contribution({ amount: '40000', categoryKey: 'labor' }),
        contribution({ amount: '25000', categoryKey: 'materials' }),
        contribution({ amount: '10000', categoryKey: null }),
      ],
      lines: [
        line({
          id: 'cat-labor',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '50000',
        }),
        line({
          id: 'cat-mat',
          lineType: 'category',
          categoryKey: 'materials',
          label: 'Materials',
          budgetAmount: '40000',
        }),
      ],
    });

    const labor = result.rows.find((row) => row.id === 'cat-labor')!;
    const materials = result.rows.find((row) => row.id === 'cat-mat')!;
    expect(labor.mappingStatus).toBe('mapped');
    expect(labor.metrics.actual).toEqual(money('40000', ILS));
    expect(labor.metrics.remainingCommitment).toBeNull();
    expect(labor.metrics.forecast).toEqual(money('40000', ILS));
    expect(labor.metrics.variance).toEqual(money('10000', ILS));
    expect(materials.metrics.actual).toEqual(money('25000', ILS));
    expect(result.unmappedRemainder).toEqual(money('35000', ILS));
  });

  it('maps work-package lines from matching workPackageId only', () => {
    const wpA = '11111111-1111-1111-1111-111111111111';
    const wpB = '22222222-2222-2222-2222-222222222222';
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('80000'),
      contributions: [
        contribution({ amount: '30000', workPackageId: wpA }),
        contribution({ amount: '15000', workPackageId: wpB }),
        contribution({ amount: '5000', workPackageId: null }),
      ],
      lines: [
        line({
          id: 'wp-a',
          lineType: 'work_package',
          workPackageId: wpA,
          label: 'Foundations',
          budgetAmount: '45000',
        }),
      ],
    });

    const mapped = result.rows.find((row) => row.id === 'wp-a')!;
    expect(mapped.mappingStatus).toBe('mapped');
    expect(mapped.metrics.actual).toEqual(money('30000', ILS));
    expect(result.unmappedRemainder).toEqual(money('50000', ILS));
  });

  it('uses engine project Actual on the total line, not a second contribution sum', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('90000', '20000', '10000'),
      contributions: [contribution({ amount: '1000', categoryKey: 'labor' })],
      lines: [
        line({
          id: 'total',
          lineType: 'total',
          label: 'Total',
          budgetAmount: '120000',
        }),
      ],
    });

    const total = result.rows.find((row) => row.id === 'total')!;
    expect(total.mappingStatus).toBe('engine_total');
    expect(total.metrics.actual).toEqual(money('90000', ILS));
    expect(total.metrics.remainingCommitment).toEqual(money('20000', ILS));
    expect(total.metrics.etc).toEqual(money('10000', ILS));
    expect(total.metrics.forecast).toEqual(money('120000', ILS));
    expect(total.metrics.variance).toEqual(zeroMoney(ILS));
    expect(result.rows.some((row) => row.kind === 'unmapped_remainder')).toBe(false);
  });

  it('leaves discipline and cost_code lines unmapped (expense/AP have no such key)', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('50000'),
      contributions: [
        contribution({ amount: '50000', categoryKey: 'electrical', workPackageId: 'wp' }),
      ],
      lines: [
        line({
          id: 'disc',
          lineType: 'discipline',
          disciplineKey: 'electrical',
          label: 'Electrical',
          budgetAmount: '20000',
        }),
        line({
          id: 'cc',
          lineType: 'cost_code',
          costCode: '03-300',
          label: 'Concrete',
          budgetAmount: '30000',
        }),
      ],
    });

    const disc = result.rows.find((row) => row.id === 'disc')!;
    const code = result.rows.find((row) => row.id === 'cc')!;
    expect(disc.mappingStatus).toBe('unmapped');
    expect(disc.metrics.actual).toBeNull();
    expect(disc.metrics.forecast).toBeNull();
    expect(disc.metrics.remainingCommitment).toBeNull();
    expect(code.mappingStatus).toBe('unmapped');
    expect(code.metrics.actual).toBeNull();
    expect(result.unmappedRemainder).toEqual(money('50000', ILS));
  });

  it('treats a category line without categoryKey as unmapped, never guessed', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('10000'),
      contributions: [contribution({ amount: '10000', categoryKey: 'labor' })],
      lines: [
        line({
          id: 'orphan',
          lineType: 'category',
          categoryKey: null,
          label: 'Unkeyed category',
          budgetAmount: '10000',
        }),
      ],
    });

    const orphan = result.rows.find((row) => row.id === 'orphan')!;
    expect(orphan.mappingStatus).toBe('unmapped');
    expect(orphan.metrics.actual).toBeNull();
    expect(result.unmappedRemainder).toEqual(money('10000', ILS));
  });

  it('always keeps an Unmapped / unallocated row for non-total lines, including zero remainder', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('40000'),
      contributions: [contribution({ amount: '40000', categoryKey: 'labor' })],
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '40000',
        }),
      ],
    });

    const remainder = result.rows.find((row) => row.id === UNMAPPED_REMAINDER_ROW_ID);
    expect(remainder).toBeDefined();
    expect(remainder!.kind).toBe('unmapped_remainder');
    expect(remainder!.metrics.actual).toEqual(zeroMoney(ILS));
    expect(result.unmappedRemainder).toEqual(zeroMoney(ILS));
  });

  it('does not drop unmapped remainder when engine Actual exceeds mapped line Actuals', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('100000'),
      contributions: [
        contribution({ amount: '20000', categoryKey: 'labor' }),
        contribution({ amount: '15000' }),
      ],
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '30000',
        }),
        line({
          id: 'total',
          lineType: 'total',
          label: 'Total',
          budgetAmount: '100000',
        }),
      ],
    });

    expect(result.unmappedRemainder).toEqual(money('80000', ILS));
    const remainder = result.rows.find((row) => row.kind === 'unmapped_remainder')!;
    expect(remainder.metrics.actual).toEqual(money('80000', ILS));
    const total = result.rows.find((row) => row.id === 'total')!;
    expect(total.metrics.actual).toEqual(money('100000', ILS));
  });

  it('adds line ETC into detail Forecast without inventing a commitment split', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('40000', '25000', '5000'),
      contributions: [contribution({ amount: '30000', categoryKey: 'labor' })],
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '50000',
          etcAmount: '8000',
        }),
      ],
    });

    const cat = result.rows.find((row) => row.id === 'cat')!;
    expect(cat.metrics.actual).toEqual(money('30000', ILS));
    expect(cat.metrics.etc).toEqual(money('8000', ILS));
    expect(cat.metrics.forecast).toEqual(money('38000', ILS));
    expect(cat.metrics.remainingCommitment).toBeNull();
    expect(cat.metrics.variance).toEqual(money('12000', ILS));
  });

  it('ignores foreign-currency contributions instead of converting them', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('10000'),
      contributions: [
        contribution({ amount: '10000', currency: 'USD', categoryKey: 'labor' }),
        contribution({ amount: '4000', categoryKey: 'labor' }),
      ],
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '20000',
        }),
      ],
    });

    expect(result.rows.find((row) => row.id === 'cat')!.metrics.actual).toEqual(money('4000', ILS));
    expect(result.unmappedRemainder).toEqual(money('6000', ILS));
  });

  it('does not treat missing contribution slices as mapped-to-zero', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('50000'),
      contributions: null,
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '20000',
        }),
      ],
    });

    const cat = result.rows.find((row) => row.id === 'cat')!;
    expect(cat.mappingStatus).toBe('unmapped');
    expect(cat.metrics.actual).toBeNull();
    expect(result.unmappedRemainder).toEqual(money('50000', ILS));
  });

  it('maps a keyed category with no matching slices as Actual zero, remainder keeps engine Actual', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('50000'),
      contributions: [],
      lines: [
        line({
          id: 'cat',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '20000',
        }),
      ],
    });

    const cat = result.rows.find((row) => row.id === 'cat')!;
    expect(cat.mappingStatus).toBe('mapped');
    expect(cat.metrics.actual).toEqual(zeroMoney(ILS));
    expect(result.unmappedRemainder).toEqual(money('50000', ILS));
  });

  it('assigns a contribution to a work-package line once, not also to its category', () => {
    const wpA = '11111111-1111-1111-1111-111111111111';
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('40000'),
      contributions: [
        contribution({
          amount: '40000',
          categoryKey: 'labor',
          workPackageId: wpA,
          expenseId: 'e1',
        }),
      ],
      lines: [
        line({
          id: 'wp-a',
          lineType: 'work_package',
          workPackageId: wpA,
          label: 'Foundations',
          budgetAmount: '45000',
        }),
        line({
          id: 'cat-labor',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '45000',
        }),
      ],
    });

    expect(result.rows.find((row) => row.id === 'wp-a')!.metrics.actual).toEqual(money('40000', ILS));
    expect(result.rows.find((row) => row.id === 'cat-labor')!.metrics.actual).toEqual(zeroMoney(ILS));
    expect(result.unmappedRemainder).toEqual(zeroMoney(ILS));
  });

  it('excludes bill-linked and Mode B labor expenses so mapped Actual cannot exceed engine Actual', () => {
    const result = mapBudgetLineActuals({
      currency: ILS,
      cost: engineCost('10000'),
      excludeLaborCategory: true,
      contributions: [
        contribution({
          amount: '4000',
          categoryKey: 'materials',
          expenseId: 'ok',
        }),
      ],
      lines: [
        line({
          id: 'cat-mat',
          lineType: 'category',
          categoryKey: 'materials',
          label: 'Materials',
          budgetAmount: '20000',
        }),
        line({
          id: 'cat-labor',
          lineType: 'category',
          categoryKey: 'labor',
          label: 'Labor',
          budgetAmount: '20000',
        }),
      ],
    });

    expect(result.rows.find((row) => row.id === 'cat-mat')!.metrics.actual).toEqual(money('4000', ILS));
    expect(result.rows.find((row) => row.id === 'cat-labor')!.metrics.actual).toEqual(zeroMoney(ILS));
    expect(Number(result.unmappedRemainder.amount)).toBeGreaterThanOrEqual(0);
    expect(result.unmappedRemainder).toEqual(money('6000', ILS));
  });
});
