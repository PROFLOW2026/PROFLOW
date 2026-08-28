import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import { buildProjectAllocatedGeneralDetail } from '@/modules/financials/domain/project-allocated-general-detail';

const ILS = 'ILS';

describe('project allocated general detail', () => {
  it('attributes expense pool sources proportionally and reconciles to project total', () => {
    const detail = buildProjectAllocatedGeneralDetail({
      expectedTotal: money('19042.57', ILS),
      rawRows: [
        {
          yearMonth: '2026-01',
          projectAllocatedAmount: '10000',
          projectWeightPercent: '20',
          poolAmount: '50000',
          basisMode: 'direct_actual_weight',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-rent',
          sourceLabel: null,
          sourcePoolAmount: '12600',
          expenseDate: '2026-01-05',
          description: 'Warehouse rent',
          supplierName: 'Ashlat Management',
          expenseGrossAmount: '12600',
          currency: ILS,
        },
        {
          yearMonth: '2026-02',
          projectAllocatedAmount: '9042.57',
          projectWeightPercent: '18',
          poolAmount: '45000',
          basisMode: 'direct_actual_weight',
          sourceKind: 'expense_unallocated',
          sourceId: 'exp-rent',
          sourceLabel: null,
          sourcePoolAmount: '12600',
          expenseDate: '2026-02-05',
          description: 'Warehouse rent',
          supplierName: 'Ashlat Management',
          expenseGrossAmount: '12600',
          currency: ILS,
        },
      ],
    });

    expect(detail.rows.length).toBeGreaterThanOrEqual(2);
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
});
