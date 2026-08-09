import { describe, expect, it } from 'vitest';
import {
  computeApprovedAdditions,
  computeApprovedReductions,
  computeCommercialPosition,
  computeCurrentContractValue,
} from '@/modules/commercial/domain/contract-value';
import { money, zeroMoney } from '@/shared/money';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import { computeMarginPercent, computeProfitPosition } from '@/modules/financials/domain/profit';
import {
  aggregateBillingPosition,
  computeOutstanding,
  sumPaidAmounts,
} from '@/modules/billing/domain/outstanding';

const ILS = 'ILS';

describe('commercial contract value', () => {
  it('sums approved additions and reductions into current value', () => {
    const events = [
      {
        id: '1',
        organizationId: 'o',
        contractId: 'c',
        projectId: 'p',
        kind: 'original' as const,
        amount: '500000.000000',
        currency: ILS,
        changeOrderId: null,
        effectiveDate: '2026-01-01',
      },
      {
        id: '2',
        organizationId: 'o',
        contractId: 'c',
        projectId: 'p',
        kind: 'change_order' as const,
        amount: '25000.000000',
        currency: ILS,
        changeOrderId: 'co1',
        effectiveDate: '2026-02-01',
      },
      {
        id: '3',
        organizationId: 'o',
        contractId: 'c',
        projectId: 'p',
        kind: 'change_order' as const,
        amount: '-10000.000000',
        currency: ILS,
        changeOrderId: 'co2',
        effectiveDate: '2026-03-01',
      },
    ];

    const position = computeCommercialPosition({
      valueEvents: events,
      pendingChanges: [],
      currency: ILS,
      originalValueFallback: null,
    });

    expect(position.approvedAdditions).toEqual(money('25000', ILS));
    expect(position.approvedReductions).toEqual(money('10000', ILS));
    expect(position.currentContractValue).toEqual(money('515000', ILS));
    expect(computeCurrentContractValue(events, ILS)).toEqual(money('515000', ILS));
  });

  it('keeps pending changes separate from current contract value', () => {
    const position = computeCommercialPosition({
      valueEvents: [
        {
          id: '1',
          organizationId: 'o',
          contractId: 'c',
          projectId: 'p',
          kind: 'original',
          amount: '100000.000000',
          currency: ILS,
          changeOrderId: null,
          effectiveDate: '2026-01-01',
        },
      ],
      pendingChanges: [
        {
          status: 'awaiting_approval',
          direction: 'addition',
          requestedAmount: '5000.000000',
          currency: ILS,
          pricedAmount: null,
        },
      ],
      currency: ILS,
      originalValueFallback: null,
    });

    expect(position.currentContractValue).toEqual(money('100000', ILS));
    expect(position.pendingChanges).toEqual(money('5000', ILS));
  });
});

describe('billing outstanding', () => {
  it('derives outstanding after partial payments', () => {
    const invoiced = money('100000', ILS);
    const paid = sumPaidAmounts(
      [{ amount: money('60000', ILS), status: 'recorded' }],
      ILS,
    );
    const outstanding = computeOutstanding(invoiced, paid);

    expect(outstanding).toEqual(money('40000', ILS));

    const position = aggregateBillingPosition(
      [
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: invoiced,
          payments: [{ amount: money('60000', ILS), status: 'recorded' }],
        },
      ],
      ILS,
    );

    expect(position.outstanding).toEqual(money('40000', ILS));
  });
});

describe('cost aggregation and coverage', () => {
  it('splits allocation lines across cost families', () => {
    const { cost, sources } = aggregateProjectCosts(
      [
        {
          amount: '6000.000000',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
        },
        {
          amount: '3000.000000',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: false,
          isAllocated: true,
          isSubcontractor: false,
        },
        {
          amount: '1000.000000',
          currency: ILS,
          costFamily: 'business_overhead',
          isDirectOnProject: false,
          isAllocated: true,
          isSubcontractor: false,
        },
      ],
      null,
      ILS,
    );

    expect(cost.byFamily.directProject).toEqual(money('9000', ILS));
    expect(cost.byFamily.businessOverhead).toEqual(money('1000', ILS));
    expect(cost.actualCostToDate).toEqual(money('10000', ILS));

    const direct = sources.find((s) => s.source === 'direct_expenses');
    const overhead = sources.find((s) => s.source === 'allocated_overhead');
    expect(direct?.hasData).toBe(true);
    expect(overhead?.hasData).toBe(true);
  });

  it('marks absent sources when no rows exist versus included when rows sum to zero', () => {
    const absent = buildFinancialCoverage([
      { source: 'direct_expenses', hasData: false },
      { source: 'workforce', hasData: false },
      { source: 'allocated_overhead', hasData: false },
      { source: 'shared_costs', hasData: false },
      { source: 'subcontractor', hasData: false },
    ]);

    expect(absent.entries.every((entry) => !entry.included)).toBe(true);
    expect(absent.basis).toBe('direct_only');

    const { sources, cost } = aggregateProjectCosts(
      [
        {
          amount: '0.000000',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
        },
      ],
      null,
      ILS,
    );

    const present = buildFinancialCoverage(sources);
    const direct = present.entries.find((e) => e.source === 'direct_expenses');
    expect(direct?.included).toBe(true);
    expect(cost.actualCostToDate).toEqual(money('0', ILS));
  });

  it('uses fully loaded basis when allocated overhead is present', () => {
    const coverage = buildFinancialCoverage([
      { source: 'direct_expenses', hasData: true },
      { source: 'workforce', hasData: false },
      { source: 'allocated_overhead', hasData: true },
      { source: 'shared_costs', hasData: false },
      { source: 'subcontractor', hasData: false },
    ]);

    expect(coverage.basis).toBe('fully_loaded');
  });
});

describe('profit and margin', () => {
  it('returns null margin when contract value is zero', () => {
    const profit = computeProfitPosition(zeroMoney(ILS), money('5000', ILS));
    expect(profit.marginPercent).toBeNull();
    expect(profit.actualMarginPercent).toBeNull();
    expect(profit.estimatedProfit).toEqual(money('-5000', ILS));
    expect(profit.actualProfit).toEqual(money('-5000', ILS));
  });

  it('computes margin as a percentage string', () => {
    const profit = computeProfitPosition(money('100000', ILS), money('70000', ILS));
    expect(profit.estimatedProfit).toEqual(money('30000', ILS));
    expect(computeMarginPercent(profit.estimatedProfit, money('100000', ILS))).toBe('30.00');
  });

  it('rounds profit to currency minor units', () => {
    const profit = computeProfitPosition(
      money('1000.004', ILS),
      money('333.336', ILS),
    );
    expect(profit.estimatedProfit.amount).toMatch(/^666\.668000$/);
  });
});

describe('approved change helpers', () => {
  it('accumulates additions and reductions separately', () => {
    const events = [
      {
        id: '1',
        organizationId: 'o',
        contractId: 'c',
        projectId: 'p',
        kind: 'change_order' as const,
        amount: '15000.000000',
        currency: ILS,
        changeOrderId: 'a',
        effectiveDate: '2026-01-01',
      },
      {
        id: '2',
        organizationId: 'o',
        contractId: 'c',
        projectId: 'p',
        kind: 'change_order' as const,
        amount: '-5000.000000',
        currency: ILS,
        changeOrderId: 'b',
        effectiveDate: '2026-02-01',
      },
    ];

    expect(computeApprovedAdditions(events, ILS)).toEqual(money('15000', ILS));
    expect(computeApprovedReductions(events, ILS)).toEqual(money('5000', ILS));
  });
});
