import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { buildProjectAllocatedGeneralDetail } from '@/modules/financials/domain/project-allocated-general-detail';
import {
  resolveAllocationMethodLabelHebrew,
  resolveAllocationMethodKey,
} from '@/modules/financials/domain/allocation-method-labels';

const ILS = 'ILS';

const baseRawRow = {
  generalCostMonthId: 'gcm-1',
  projectWeightPercent: '20',
  sourceLabel: null,
  sourcePoolAmount: '12600',
  expenseDate: '2026-01-05',
  description: 'Warehouse rent',
  recurringSourceTitle: null,
  supplierName: 'Ashlat Management',
  expenseGrossAmount: '12600',
  expenseCostFamily: 'business_overhead',
  costCategoryKey: 'rent',
  expenseAllocationDriverMethod: null,
  categoryDefaultAllocationMethod: null,
  monthProjectCount: 5,
  currency: ILS,
} as const;

describe('project allocated general detail', () => {
  it('attributes expense pool sources proportionally and reconciles to project total', () => {
    const detail = buildProjectAllocatedGeneralDetail({
      expectedTotal: money('19042.57', ILS),
      rawRows: [
        {
          ...baseRawRow,
          yearMonth: '2026-01',
          projectAllocatedAmount: '10000',
          poolAmount: '50000',
          basisMode: 'direct_actual_weight',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-rent',
        },
        {
          ...baseRawRow,
          yearMonth: '2026-02',
          projectAllocatedAmount: '9042.57',
          poolAmount: '45000',
          basisMode: 'direct_actual_weight',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-rent',
          expenseDate: '2026-02-05',
        },
      ],
    });

    expect(detail.rows.length).toBeGreaterThanOrEqual(1);
    const expenseRow = detail.rows.find((row) => row.expenseId === 'exp-rent');
    expect(expenseRow).toBeDefined();
    expect(expenseRow!.allocationMethodLabel).toBe('לפי עלויות ישירות');
    expect(expenseRow!.sharedProjectCount).toBe(5);
    expect(expenseRow!.monthSlices).toHaveLength(2);
    expect(expenseRow!.poolWeightPercent).toBe('20.0');
    const sum = detail.rows.reduce((total, row) => total + Number(row.allocatedAmount.amount), 0);
    expect(sum).toBeCloseTo(19042.57, 2);
    expect(detail.reconciles).toBe(true);
  });

  it('returns empty rows when no GCM attribution exists', () => {
    const detail = buildProjectAllocatedGeneralDetail({
      expectedTotal: money('0', ILS),
      rawRows: [],
    });
    expect(detail.rows).toHaveLength(0);
    expect(detail.reconciles).toBe(true);
  });

  it('uses canonical pool weight percent, not allocated/gross ratio', () => {
    const detail = buildProjectAllocatedGeneralDetail({
      expectedTotal: money('3991.44', ILS),
      rawRows: [
        {
          ...baseRawRow,
          yearMonth: '2026-07',
          projectAllocatedAmount: '3991.44',
          poolAmount: '10675.50',
          projectWeightPercent: '37.3801',
          basisMode: 'direct_actual_weight',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-warehouse',
          expenseGrossAmount: '12600',
          sourcePoolAmount: '12600',
        },
      ],
    });
    expect(detail.rows[0]!.poolWeightPercent).toBe('37.4');
    expect(detail.rows[0]!.informationalPercent).toBeNull();
  });

  it('shows informational percent only for manual_amount', () => {
    const detail = buildProjectAllocatedGeneralDetail({
      expectedTotal: money('2500', ILS),
      rawRows: [
        {
          ...baseRawRow,
          yearMonth: '2026-03',
          projectAllocatedAmount: '2500',
          poolAmount: '10000',
          basisMode: 'manual_amount',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-insurance',
          description: null,
          recurringSourceTitle: 'ביטוח עסקי',
          expenseGrossAmount: '10000',
          sourcePoolAmount: '10000',
          expenseAllocationDriverMethod: 'manual_amount',
        },
      ],
    });
    expect(detail.rows[0]!.description).toBe('ביטוח עסקי');
    expect(detail.rows[0]!.poolWeightPercent).toBe('20.0');
    expect(detail.rows[0]!.informationalPercent).toBe('25.0');
  });
});

describe('allocation method labels', () => {
  it('maps known methods to Hebrew', () => {
    expect(resolveAllocationMethodLabelHebrew('manual_amount')).toBe('סכום ידני');
    expect(resolveAllocationMethodLabelHebrew('labor_hours_weight')).toBe('לפי שעות עבודה');
    expect(resolveAllocationMethodLabelHebrew('direct_actual_weight')).toBe('לפי עלויות ישירות');
  });

  it('prefers expense driver over month basis', () => {
    expect(
      resolveAllocationMethodKey('manual_percent', 'direct_actual_weight', null),
    ).toBe('manual_percent');
  });
});
