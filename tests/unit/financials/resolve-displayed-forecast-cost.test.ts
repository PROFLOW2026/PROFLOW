import { describe, expect, it } from 'vitest';
import { emptyCostPosition } from '@/modules/financials/domain/cost-aggregation';
import { resolveDisplayedForecastFinalCost } from '@/modules/financials/ui/resolve-displayed-forecast-cost';
import { money } from '@/shared/money';

const ILS = 'ILS';

function divergentForecastCost() {
  return {
    ...emptyCostPosition(ILS),
    estimatedFinalCost: money('100', ILS),
    directForecastFinalCost: money('100', ILS),
    fullForecastFinalCost: money('180', ILS),
  };
}

describe('resolveDisplayedForecastFinalCost', () => {
  it('shows the direct forecast when the org mode is direct', () => {
    const cost = divergentForecastCost();
    expect(resolveDisplayedForecastFinalCost('direct', cost)).toEqual(
      cost.directForecastFinalCost,
    );
  });

  it('shows the full forecast when the org mode includes general cost', () => {
    const cost = divergentForecastCost();
    expect(resolveDisplayedForecastFinalCost('include_general', cost)).toEqual(
      cost.fullForecastFinalCost,
    );
    expect(resolveDisplayedForecastFinalCost('include_general', cost).amount).not.toBe(
      cost.estimatedFinalCost.amount,
    );
  });

  it('uses the direct forecast when the mode is omitted', () => {
    const cost = divergentForecastCost();
    expect(resolveDisplayedForecastFinalCost(undefined, cost)).toEqual(
      cost.directForecastFinalCost,
    );
  });
});
