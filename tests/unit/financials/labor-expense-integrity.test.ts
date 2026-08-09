import { describe, expect, it } from 'vitest';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import {
  isLaborCostCategoryKey,
  shouldExcludeLaborExpenseForWorkforce,
} from '@/modules/financials/domain/labor-expense-integrity';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('labor expense vs time-entry integrity', () => {
  it('recognizes the system labor category key', () => {
    expect(isLaborCostCategoryKey('labor')).toBe(true);
    expect(isLaborCostCategoryKey('LABOR')).toBe(true);
    expect(isLaborCostCategoryKey('materials')).toBe(false);
  });

  it('excludes labor expenses only when workforce data applies', () => {
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: true,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(true);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: true,
        projectId: 'p1',
        hasWorkforceData: false,
      }),
    ).toBe(false);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: false,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);
  });

  it('org scope excludes labor expenses only for projects with time labor', () => {
    const withLabor = new Set(['p-with-time']);
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: true,
        projectId: 'p-with-time',
        hasWorkforceData: true,
        projectIdsWithWorkforceLabor: withLabor,
      }),
    ).toBe(true);
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: true,
        projectId: 'p-mode-b-only',
        hasWorkforceData: true,
        projectIdsWithWorkforceLabor: withLabor,
      }),
    ).toBe(false);
  });

  it('does not double-count labor category expense when time True Cost is present', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: true,
        },
        {
          amount: '500.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: false,
        },
      ],
      {
        laborCost: money('3000', ILS),
        hasWorkforceData: true,
      },
      ILS,
    );

    // materials 500 + time 3000; labor expense 8000 excluded
    expect(cost.actualCostToDate).toEqual(money('3500', ILS));
    expect(cost.laborActual).toEqual(money('3000', ILS));
    expect(partials).toContainEqual({
      reason: 'labor_category_excluded_for_workforce',
      count: 1,
    });
  });

  it('keeps Mode B labor expense when there is no workforce data', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: true,
        },
      ],
      null,
      ILS,
    );

    expect(cost.actualCostToDate).toEqual(money('8000', ILS));
    expect(partials).toEqual([]);
  });
});
