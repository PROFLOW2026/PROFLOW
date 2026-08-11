import { describe, expect, it } from 'vitest';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { buildProjectFinancialExplainability } from '@/modules/financials/domain/metric-explainability';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import { money, zeroMoney } from '@/shared/money';
import { businessDate } from '@/shared/dates';

const ILS = 'ILS';

describe('buildProjectFinancialExplainability', () => {
  it('builds Actual / Forecast slices from the composed engine without inventing totals', () => {
    const composed = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: '100.00',
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      commercialData: {
        currency: ILS,
        position: {
          originalContractValue: money('1000', ILS),
          approvedAdditions: money('50', ILS),
          approvedReductions: zeroMoney(ILS),
          currentContractValue: money('1050', ILS),
          pendingChanges: money('20', ILS),
        },
      },
      billingRows: {
        currency: ILS,
        records: [
          {
            id: 'b1',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: money('400.00', ILS),
            dueDate: businessDate('2026-04-01'),
            payments: [{ amount: money('100.00', ILS), status: 'recorded' }],
          },
        ],
      },
      expenseContributions: [
        {
          amount: '200.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
        },
      ],
      laborInput: null,
      committed: { total: money('50.00', ILS), excludedForeignCurrencyCount: 0 },
      openAp: {
        total: money('25.00', ILS),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
      },
      recognizedVendor: null,
    });

    const explain = buildProjectFinancialExplainability({
      financials: composed,
      dataConfidence: composed.dataConfidence,
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      canReadAp: true,
      unallocatedBusinessCosts: money('75.00', ILS),
    });

    const byMetric = Object.fromEntries(explain.metrics.map((m) => [m.metric, m]));

    expect(byMetric.actual?.total.amount).toBe(composed.cost.actualCostToDate.amount);
    expect(byMetric.forecast?.total.amount).toBe(composed.cost.estimatedFinalCost.amount);
    expect(byMetric.current_contract?.total.amount).toBe(
      composed.commercial!.currentContractValue.amount,
    );
    expect(byMetric.actual_margin?.total.amount).toBe(composed.profit!.actualProfit.amount);
    expect(byMetric.forecast_margin?.total.amount).toBe(composed.profit!.estimatedProfit.amount);
    expect(byMetric.outstanding_ar?.total.amount).toBe(composed.billing.outstanding.amount);
    const arByKey = Object.fromEntries(
      (byMetric.outstanding_ar?.categories ?? []).map((c) => [c.key, c]),
    );
    expect(arByKey.month_close_revenue?.role).toBe('info');
    expect(arByKey.month_close_revenue?.amount.amount).toBe('0.000000');
    expect(byMetric.outstanding_ap?.total.amount).toBe(composed.cost.openApPayable.amount);
    expect(byMetric.unallocated_cost?.total.amount).toBe('75.000000');

    const actualByKey = Object.fromEntries(
      (byMetric.actual?.categories ?? []).map((c) => [c.key, c]),
    );
    expect(actualByKey.recognized_original?.role).toBe('add');
    expect(actualByKey.recognized_original?.amount.amount).toBe(
      composed.cost.actualCostToDate.amount,
    );
    expect(actualByKey.month_close_cost?.role).toBe('info');
    expect(actualByKey.month_close_cost?.amount.amount).toBe('0.000000');
    expect(actualByKey.actual_cost?.role).toBe('total');
    expect(actualByKey.direct_project?.role).toBe('info');

    // Forecast categories must reuse Actual + commitments + ETC (same engine).
    const forecastAdds = byMetric.forecast!.categories.filter((c) => c.role === 'add');
    expect(forecastAdds.map((c) => c.key)).toEqual([
      'actual_cost',
      'committed_open',
      'expected_remaining',
    ]);
  });

  it('hides profit / commercial / billing packs when permissions deny them', () => {
    const composed = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    const explain = buildProjectFinancialExplainability({
      financials: composed,
      dataConfidence: composed.dataConfidence,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      canReadAp: false,
    });

    const keys = explain.metrics.map((m) => m.metric);
    expect(keys).toContain('actual');
    expect(keys).toContain('forecast');
    expect(keys).not.toContain('current_contract');
    expect(keys).not.toContain('actual_margin');
    expect(keys).not.toContain('forecast_margin');
    expect(keys).not.toContain('outstanding_ar');
    expect(keys).not.toContain('outstanding_ap');
  });

  it('attaches needs_data confidence when labor entries miss employer cost', () => {
    const composed = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      commercialData: {
        currency: ILS,
        position: {
          originalContractValue: money('1000', ILS),
          approvedAdditions: zeroMoney(ILS),
          approvedReductions: zeroMoney(ILS),
          currentContractValue: money('1000', ILS),
          pendingChanges: zeroMoney(ILS),
        },
      },
      billingRows: { currency: ILS, records: [] },
      expenseContributions: [],
      laborInput: {
        laborCost: money('10', ILS),
        hasWorkforceData: true,
        entriesMissingCost: 4,
      },
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    expect(composed.dataConfidence.level).toBe('needs_data');
    expect(composed.dataConfidence.reasons).toContain('workforce_entries_missing_cost');
    // Coverage still documents the partial — confidence does not invent a second Actual.
    expect(composed.coverage.partials).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: 'workforce_entries_missing_cost', count: 4 }),
      ]),
    );
    // Smoke: coverage helper still builds.
    expect(buildFinancialCoverage([{ source: 'workforce', hasData: true }]).basis).toBe(
      'direct_only',
    );
  });

  it('explains Actual as original recognized + month-close correction + net', () => {
    const composed = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [
        {
          amount: '200.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
      monthCloseEconomic: {
        costNet: money('40', ILS),
        revenueNet: zeroMoney(ILS),
      },
    });

    const explain = buildProjectFinancialExplainability({
      financials: composed,
      dataConfidence: composed.dataConfidence,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      canReadAp: false,
    });

    const actual = explain.metrics.find((m) => m.metric === 'actual');
    expect(actual?.total.amount).toBe('240.000000');
    expect(composed.cost.monthCloseCostNet.amount).toBe('40.000000');
    expect(composed.cost.byFamily.directProject.amount).toBe('200.000000');

    const byKey = Object.fromEntries((actual?.categories ?? []).map((c) => [c.key, c]));
    expect(byKey.recognized_original?.role).toBe('add');
    expect(byKey.recognized_original?.amount.amount).toBe('200.000000');
    expect(byKey.month_close_cost?.role).toBe('add');
    expect(byKey.month_close_cost?.amount.amount).toBe('40.000000');
    expect(byKey.direct_project?.role).toBe('info');
    expect(byKey.actual_cost?.role).toBe('total');
    expect(byKey.actual_cost?.amount.amount).toBe('240.000000');
    expect(actual?.sources.some((s) => s.kind === 'month_close')).toBe(true);
  });

  it('explains outstanding AR as original invoiced + post-close revenue + net', () => {
    const composed = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: true,
      canReadProfit: false,
      commercialData: null,
      billingRows: {
        currency: ILS,
        records: [
          {
            id: 'b1',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: money('400.00', ILS),
            dueDate: businessDate('2026-04-01'),
            payments: [],
          },
        ],
      },
      expenseContributions: [],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
      monthCloseEconomic: {
        costNet: zeroMoney(ILS),
        revenueNet: money('50', ILS),
      },
    });

    const explain = buildProjectFinancialExplainability({
      financials: composed,
      dataConfidence: composed.dataConfidence,
      canReadCommercial: false,
      canReadBilling: true,
      canReadProfit: false,
      canReadAp: false,
    });

    expect(composed.billing.invoiced.amount).toBe('450.000000');
    expect(composed.billing.monthCloseRevenueNet.amount).toBe('50.000000');

    const ar = explain.metrics.find((m) => m.metric === 'outstanding_ar');
    const byKey = Object.fromEntries((ar?.categories ?? []).map((c) => [c.key, c]));
    expect(byKey.invoiced?.role).toBe('add');
    expect(byKey.invoiced?.amount.amount).toBe('400.000000');
    expect(byKey.month_close_revenue?.role).toBe('add');
    expect(byKey.month_close_revenue?.amount.amount).toBe('50.000000');
    expect(byKey.outstanding_ar?.role).toBe('total');
    expect(byKey.outstanding_ar?.amount.amount).toBe('450.000000');
    expect(ar?.sources.some((s) => s.kind === 'month_close')).toBe(true);
  });
});
