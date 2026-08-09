import { describe, expect, it } from 'vitest';
import { excludeCommittedFromActualCost } from '@/modules/procurement';
import {
  aggregateProjectCosts,
  emptyCostPosition,
  withCommittedAndApPayable,
} from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';

describe('report cost Actual vs Committed', () => {
  it('keeps open committed cost out of actual totals', () => {
    const aggregated = aggregateProjectCosts(
      [
        {
          amount: '1000.00',
          currency: 'ILS',
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: true,
        },
      ],
      {
        laborCost: money('250.00', 'ILS'),
        hasWorkforceData: true,
      },
      'ILS',
    );

    expect(aggregated.cost.actualCostToDate).toEqual(money('1250.00', 'ILS'));
    expect(aggregated.cost.laborActual).toEqual(money('250.00', 'ILS'));
    expect(aggregated.cost.vendorActual).toEqual(money('1000.00', 'ILS'));
    expect(aggregated.cost.committedOpen).toEqual(zeroMoney('ILS'));

    const separated = excludeCommittedFromActualCost({
      actualExpenseTotal: aggregated.cost.actualCostToDate.amount,
      committedOpenTotal: '500.00',
      currency: 'ILS',
    });
    expect(separated.actualCost).toBe(aggregated.cost.actualCostToDate.amount);
    expect(separated.committedOnly).toBe(money('500.00', 'ILS').amount);

    const withCommitments = withCommittedAndApPayable(
      aggregated.cost,
      money('500.00', 'ILS'),
      money('75.00', 'ILS'),
    );
    expect(withCommitments.actualCostToDate).toEqual(aggregated.cost.actualCostToDate);
    expect(withCommitments.committedOpen).toEqual(money('500.00', 'ILS'));
    expect(withCommitments.openApPayable).toEqual(money('75.00', 'ILS'));
  });

  it('empty cost position carries Actual/Committed/Forecast zeros', () => {
    const empty = emptyCostPosition('USD');
    expect(empty.laborActual).toEqual(zeroMoney('USD'));
    expect(empty.committedOpen).toEqual(zeroMoney('USD'));
    expect(empty.openApPayable).toEqual(zeroMoney('USD'));
  });
});
