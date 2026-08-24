import { describe, expect, it } from 'vitest';
import {
  emptyCostPosition,
  withAllocatedGeneralBusinessCost,
} from '@/modules/financials/domain/cost-aggregation';
import { resolveProjectProfitabilityDisplay } from '@/modules/financials/domain/project-profitability-display';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

function costWithGeneral(directAmount: string, allocAmount: string) {
  const direct = money(directAmount, ILS);
  const allocated = money(allocAmount, ILS);
  const base = {
    ...emptyCostPosition(ILS),
    actualCostToDate: direct,
    directActualCostToDate: direct,
    estimatedFinalCost: direct,
  };
  return withAllocatedGeneralBusinessCost(base, allocated);
}

describe('withAllocatedGeneralBusinessCost', () => {
  it('keeps actualCostToDate as Direct and sets fullActualCostToDate', () => {
    const cost = costWithGeneral('60000', '10000');

    expect(cost.actualCostToDate).toEqual(money('60000', ILS));
    expect(cost.directActualCostToDate).toEqual(money('60000', ILS));
    expect(cost.fullActualCostToDate).toEqual(money('70000', ILS));
    expect(cost.allocatedGeneralBusinessCost).toEqual(money('10000', ILS));
  });

  it('uses Direct (not Full) for estimatedFinalCost when no commitments', () => {
    const cost = costWithGeneral('60000', '10000');
    expect(cost.estimatedFinalCost).toEqual(money('60000', ILS));
  });
});

describe('resolveProjectProfitabilityDisplay', () => {
  const contract = money('100000', ILS);

  it('direct mode: rev 100k, direct 60k, alloc 10k → profit 40k', () => {
    const cost = costWithGeneral('60000', '10000');
    const display = resolveProjectProfitabilityDisplay('direct', cost, contract, false);

    expect(display.primaryActualCost).toEqual(money('60000', ILS));
    expect(display.primaryProfit).toEqual(money('40000', ILS));
    expect(display.showBothProfits).toBe(false);
  });

  it('include_general mode: profit 30k on Full 70k', () => {
    const cost = costWithGeneral('60000', '10000');
    const display = resolveProjectProfitabilityDisplay('include_general', cost, contract, false);

    expect(display.primaryActualCost).toEqual(money('70000', ILS));
    expect(display.primaryProfit).toEqual(money('30000', ILS));
  });

  it('both mode: directProfit 40k and afterGeneralProfit 30k', () => {
    const cost = costWithGeneral('60000', '10000');
    const display = resolveProjectProfitabilityDisplay('both', cost, contract, false);

    expect(display.showBothProfits).toBe(true);
    expect(display.directProfit).toEqual(money('40000', ILS));
    expect(display.afterGeneralProfit).toEqual(money('30000', ILS));
  });

  it('mode switch does not change economic cost fields', () => {
    const cost = costWithGeneral('60000', '10000');
    const directDisplay = resolveProjectProfitabilityDisplay('direct', cost, contract, false);
    const fullDisplay = resolveProjectProfitabilityDisplay('include_general', cost, contract, false);

    expect(directDisplay.directActualCost).toEqual(fullDisplay.directActualCost);
    expect(directDisplay.fullActualCost).toEqual(fullDisplay.fullActualCost);
    expect(cost.actualCostToDate).toEqual(money('60000', ILS));
    expect(cost.fullActualCostToDate).toEqual(money('70000', ILS));
  });

  it('zero allocation: fullActualCostToDate equals Direct', () => {
    const direct = money('60000', ILS);
    const cost = withAllocatedGeneralBusinessCost(
      { ...emptyCostPosition(ILS), actualCostToDate: direct, directActualCostToDate: direct },
      zeroMoney(ILS),
    );
    expect(cost.fullActualCostToDate).toEqual(direct);
    expect(cost.actualCostToDate).toEqual(direct);
  });
});
