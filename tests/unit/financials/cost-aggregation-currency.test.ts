import { describe, expect, it } from 'vitest';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('aggregateProjectCosts foreign currency resilience (HIGH-4)', () => {
  it('excludes foreign-currency expense rows instead of throwing', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '1000.000000',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
        },
        {
          amount: '500.000000',
          currency: 'USD',
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
        },
      ],
      null,
      ILS,
    );

    expect(cost.actualCostToDate).toEqual(money('1000', ILS));
    expect(partials).toEqual([
      { reason: 'foreign_currency_expenses_excluded', count: 1 },
    ]);
  });

  it('records workforce entries missing cost as partial coverage (MEDIUM-12)', () => {
    const { partials } = aggregateProjectCosts(
      [],
      {
        laborCost: money('800', ILS),
        hasWorkforceData: true,
        entriesMissingCost: 2,
      },
      ILS,
    );

    expect(partials).toEqual([{ reason: 'workforce_entries_missing_cost', count: 2 }]);
  });

  it('records foreign-currency labor rows as partial coverage (MEDIUM-13 read path)', () => {
    const { cost, partials } = aggregateProjectCosts(
      [],
      {
        laborCost: money('800', ILS),
        hasWorkforceData: true,
        excludedForeignCurrencyEntries: 1,
      },
      ILS,
    );

    expect(cost.byFamily.directProject).toEqual(money('800', ILS));
    expect(partials).toEqual([{ reason: 'foreign_currency_labor_excluded', count: 1 }]);
  });
});
