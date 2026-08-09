import { describe, expect, it } from 'vitest';
import {
  aggregateProjectCosts,
  computeForecastFinalCost,
  withCommittedAndApPayable,
} from '@/modules/financials/domain/cost-aggregation';
import { computeProfitPosition } from '@/modules/financials/domain/profit';
import { computeCommittedAfterConsumption } from '@/modules/procurement';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('forecast final cost engine', () => {
  it('keeps forecast equal to actual when no commitments or ETC', () => {
    const aggregated = aggregateProjectCosts(
      [
        {
          amount: '92000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: true,
        },
      ],
      null,
      ILS,
    );

    const cost = withCommittedAndApPayable(
      aggregated.cost,
      zeroMoney(ILS),
      zeroMoney(ILS),
      zeroMoney(ILS),
    );

    expect(cost.actualCostToDate).toEqual(money('92000', ILS));
    expect(cost.estimatedFinalCost).toEqual(money('92000', ILS));
    expect(cost.estimatedFinalCost).toEqual(cost.actualCostToDate);
  });

  it('does not double-count a fully consumed PO (100k → actual 92k ≠ 192k)', () => {
    // PO 100k fully consumed via bill settlement → remaining commitment 0;
    // recognized vendor bill (or expense) supplies Actual 92k.
    const consumed = computeCommittedAfterConsumption({
      openAmount: '100000.00',
      consumeAmount: '100000.00',
      currency: ILS,
    });
    expect(consumed.remainingAmount).toBe(zeroMoney(ILS).amount);
    expect(consumed.status).toBe('closed');

    const forecast = computeForecastFinalCost({
      actualCostToDate: money('92000', ILS),
      remainingCommitments: money(consumed.remainingAmount, ILS),
      expectedRemainingCost: zeroMoney(ILS),
    });

    expect(forecast).toEqual(money('92000', ILS));
    expect(forecast).not.toEqual(money('192000', ILS));
  });

  it('recognized vendor bill keeps forecast exposure when commitment is closed (no expense)', () => {
    const cost = withCommittedAndApPayable(
      {
        ...aggregateProjectCosts([], null, ILS).cost,
        actualCostToDate: money('92000', ILS),
        vendorActual: money('92000', ILS),
        estimatedFinalCost: money('92000', ILS),
      },
      zeroMoney(ILS),
      money('92000', ILS), // cash AP — must not inflate forecast
      zeroMoney(ILS),
    );

    expect(cost.actualCostToDate).toEqual(money('92000', ILS));
    expect(cost.committedOpen).toEqual(zeroMoney(ILS));
    expect(cost.estimatedFinalCost).toEqual(money('92000', ILS));
    expect(cost.openApPayable).toEqual(money('92000', ILS));
  });

  it('uses remaining commitment after partial consumption (40k of 100k → 60k)', () => {
    const partial = computeCommittedAfterConsumption({
      openAmount: '100000.00',
      consumeAmount: '40000.00',
      currency: ILS,
    });
    expect(partial.remainingAmount).toBe(money('60000', ILS).amount);
    expect(partial.status).toBe('partially_consumed');

    const aggregated = aggregateProjectCosts(
      [
        {
          amount: '40000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: true,
        },
      ],
      null,
      ILS,
    );

    const cost = withCommittedAndApPayable(
      aggregated.cost,
      money(partial.remainingAmount, ILS),
      zeroMoney(ILS),
      zeroMoney(ILS),
    );

    // Forecast = 40k actual + 60k remaining commitment = 100k (not 140k).
    expect(cost.actualCostToDate).toEqual(money('40000', ILS));
    expect(cost.committedOpen).toEqual(money('60000', ILS));
    expect(cost.estimatedFinalCost).toEqual(money('100000', ILS));
  });

  it('adds expected remaining cost without folding open AP into forecast', () => {
    const cost = withCommittedAndApPayable(
      {
        ...aggregateProjectCosts([], null, ILS).cost,
        actualCostToDate: money('50000', ILS),
        estimatedFinalCost: money('50000', ILS),
      },
      money('10000', ILS),
      money('8000', ILS), // open AP — cash only
      money('15000', ILS), // ETC
    );

    expect(cost.openApPayable).toEqual(money('8000', ILS));
    expect(cost.expectedRemainingCost).toEqual(money('15000', ILS));
    // 50 + 10 + 15 = 75; AP 8k must not inflate forecast
    expect(cost.estimatedFinalCost).toEqual(money('75000', ILS));
    expect(cost.actualCostToDate).toEqual(money('50000', ILS));
  });

  it('computes distinct actual vs forecast margins', () => {
    const contract = money('200000', ILS);
    const actual = money('92000', ILS);
    const forecast = money('152000', ILS); // actual 92k + remaining 60k

    const profit = computeProfitPosition(contract, forecast, actual);

    expect(profit.actualProfit).toEqual(money('108000', ILS));
    expect(profit.actualMarginPercent).toBe('54.00');
    expect(profit.estimatedProfit).toEqual(money('48000', ILS));
    expect(profit.marginPercent).toBe('24.00');
    expect(profit.estimatedProfit).not.toEqual(profit.actualProfit);
  });

  it('when forecast equals actual, margins match (backward compatible)', () => {
    const profit = computeProfitPosition(money('100000', ILS), money('40000', ILS));
    expect(profit.estimatedProfit).toEqual(money('60000', ILS));
    expect(profit.actualProfit).toEqual(money('60000', ILS));
    expect(profit.marginPercent).toBe('60.00');
    expect(profit.actualMarginPercent).toBe('60.00');
  });
});
