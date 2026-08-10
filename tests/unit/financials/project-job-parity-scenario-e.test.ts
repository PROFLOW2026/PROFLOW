import { describe, expect, it } from 'vitest';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import {
  aggregateOrgCost,
  aggregateOrgProfit,
} from '@/modules/financials/domain/aggregate-org-report';
import {
  filterRowsByWorkKind,
  partitionWorkKindCounts,
} from '@/modules/financials/domain/work-kind-filter';
import { resolveProjectKpiDisplay } from '@/modules/financials/ui/resolve-kpi-display';
import { addMoney, money, zeroMoney, type MoneyValue } from '@/shared/money';

const ILS = 'ILS';

/**
 * Scenario E — mixed portfolio: 2 classic projects + 8 jobs (fixed + open).
 * Proves All / Projects / Jobs filters partition without double-count,
 * and open-price jobs never inject fake loss into org profit.
 */
function rollupRow(
  partial: Partial<ProjectRollupRow> &
    Pick<ProjectRollupRow, 'projectId' | 'name' | 'workKind' | 'pricingMode' | 'priceNotSet'>,
): ProjectRollupRow {
  return {
    status: 'active',
    currency: ILS,
    originalContract: null,
    approvedAdditions: null,
    approvedReductions: null,
    currentContract: null,
    pendingChanges: null,
    invoiced: null,
    paid: null,
    outstanding: null,
    actualCost: zeroMoney(ILS),
    laborActual: zeroMoney(ILS),
    vendorActual: zeroMoney(ILS),
    overheadActual: zeroMoney(ILS),
    committedOpen: zeroMoney(ILS),
    openApPayable: zeroMoney(ILS),
    expectedRemainingCost: zeroMoney(ILS),
    estimatedFinalCost: zeroMoney(ILS),
    assetCapitalActual: zeroMoney(ILS),
    estimatedProfit: null,
    marginPercent: null,
    actualProfit: null,
    actualMarginPercent: null,
    progressPercent: null,
    profitable: null,
    ...partial,
  };
}

function buildMixedPortfolio(): ProjectRollupRow[] {
  const projects: ProjectRollupRow[] = [
    rollupRow({
      projectId: 'proj-1',
      name: 'Tower A',
      workKind: 'project',
      pricingMode: null,
      priceNotSet: false,
      currentContract: money('1000000', ILS),
      actualCost: money('400000', ILS),
      estimatedFinalCost: money('450000', ILS),
      estimatedProfit: money('550000', ILS),
      actualProfit: money('600000', ILS),
      profitable: true,
    }),
    rollupRow({
      projectId: 'proj-2',
      name: 'Campus B',
      workKind: 'project',
      pricingMode: null,
      priceNotSet: false,
      currentContract: money('500000', ILS),
      actualCost: money('520000', ILS),
      estimatedFinalCost: money('540000', ILS),
      estimatedProfit: money('-40000', ILS),
      actualProfit: money('-20000', ILS),
      profitable: false,
    }),
  ];

  const fixedJobs: ProjectRollupRow[] = Array.from({ length: 5 }, (_, i) =>
    rollupRow({
      projectId: `job-fixed-${i + 1}`,
      name: `Fixed Job ${i + 1}`,
      workKind: 'job',
      pricingMode: 'fixed',
      priceNotSet: false,
      currentContract: money('20000', ILS),
      actualCost: money('8000', ILS),
      estimatedFinalCost: money('9000', ILS),
      estimatedProfit: money('11000', ILS),
      actualProfit: money('12000', ILS),
      profitable: true,
    }),
  );

  const openJobs: ProjectRollupRow[] = Array.from({ length: 3 }, (_, i) =>
    rollupRow({
      projectId: `job-open-${i + 1}`,
      name: `Open Job ${i + 1}`,
      workKind: 'job',
      pricingMode: 'open',
      priceNotSet: true,
      // Costs accumulate; no revenue / profit claimed.
      currentContract: null,
      actualCost: money('3000', ILS),
      estimatedFinalCost: money('3500', ILS),
      estimatedProfit: null,
      actualProfit: null,
      profitable: null,
    }),
  );

  return [...projects, ...fixedJobs, ...openJobs];
}

function sumActual(rows: readonly ProjectRollupRow[]): MoneyValue {
  return rows.reduce(
    (acc, row) => addMoney(acc, row.actualCost ?? zeroMoney(ILS)),
    zeroMoney(ILS),
  );
}

describe('Scenario E — mixed 2 projects + 8 jobs filters', () => {
  const portfolio = buildMixedPortfolio();

  it('partitions All = Projects + Jobs with no double count', () => {
    const counts = partitionWorkKindCounts(portfolio);
    expect(counts).toEqual({ all: 10, project: 2, job: 8 });

    const all = filterRowsByWorkKind(portfolio, 'all');
    const projectsOnly = filterRowsByWorkKind(portfolio, 'project');
    const jobsOnly = filterRowsByWorkKind(portfolio, 'job');

    expect(all).toHaveLength(10);
    expect(projectsOnly).toHaveLength(2);
    expect(jobsOnly).toHaveLength(8);

    const allCost = sumActual(all);
    const projectCost = sumActual(projectsOnly);
    const jobCost = sumActual(jobsOnly);

    expect(addMoney(projectCost, jobCost)).toEqual(allCost);
    // 400k + 520k + 5×8k + 3×3k = 969k
    expect(allCost.amount).toBe('969000.000000');
  });

  it('keeps open-price jobs out of profit aggregates (no fake −loss)', () => {
    const jobsOnly = filterRowsByWorkKind(portfolio, 'job');
    const profit = aggregateOrgProfit(jobsOnly, ILS);
    // 5 fixed jobs × 11k forecast margin = 55k; open jobs contribute 0 (null)
    expect(profit.estimatedProfit.value.amount).toBe('55000.000000');
    expect(profit.actualProfit.value.amount).toBe('60000.000000');

    const openOnly = jobsOnly.filter((row) => row.priceNotSet);
    expect(openOnly).toHaveLength(3);
    expect(openOnly.every((row) => row.estimatedProfit == null)).toBe(true);
    expect(openOnly.every((row) => row.profitable == null)).toBe(true);

    const cost = aggregateOrgCost(openOnly, ILS, {
      unallocatedBusinessCosts: money('12000', ILS),
    });
    expect(cost.actual.value.amount).toBe('9000.000000');
    expect(cost.estimatedFinal.value.amount).toBe('10500.000000');
    // Unallocated org costs stay visible beside — not folded into project profit.
    expect(cost.unallocatedBusinessCosts?.value.amount).toBe('12000.000000');
  });

  it('compose + KPI gate open-price: cost forecast OK, margins null', () => {
    const composed = composeProjectFinancials({
      projectId: 'job-open-1',
      currency: ILS,
      expectedRemainingCostAmount: '500.00',
      workKind: 'job',
      pricingMode: 'open',
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      commercialData: {
        currency: ILS,
        position: {
          originalContractValue: zeroMoney(ILS),
          approvedAdditions: zeroMoney(ILS),
          approvedReductions: zeroMoney(ILS),
          currentContractValue: zeroMoney(ILS),
          pendingChanges: zeroMoney(ILS),
        },
      },
      billingRows: { currency: ILS, records: [] },
      expenseContributions: [
        {
          amount: '3000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'job-open-1',
          expenseId: 'e-open',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    expect(composed.priceNotSet).toBe(true);
    expect(composed.workKind).toBe('job');
    expect(composed.pricingMode).toBe('open');
    expect(composed.cost.actualCostToDate.amount).toBe('3000.000000');
    expect(composed.cost.estimatedFinalCost.amount).toBe('3500.000000');
    expect(composed.profit).toBeNull();

    const kpis = resolveProjectKpiDisplay(composed);
    expect(kpis.priceNotSet).toBe(true);
    expect(kpis.forecastCost.amount).toBe('3500.000000');
    expect(kpis.actualMargin).toBeNull();
    expect(kpis.forecastMargin).toBeNull();
    expect(kpis.currentContract).toBeNull();
  });

  it('job without commercialData does not invent 0 − cost loss', () => {
    const composed = composeProjectFinancials({
      projectId: 'job-orphan-1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      workKind: 'job',
      pricingMode: 'fixed',
      canReadCommercial: true,
      canReadBilling: false,
      canReadProfit: true,
      commercialData: null,
      billingRows: null,
      expenseContributions: [
        {
          amount: '1800.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'job-orphan-1',
          expenseId: 'e-orphan',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    expect(composed.priceNotSet).toBe(true);
    expect(composed.profit).toBeNull();
    expect(composed.cost.actualCostToDate.amount).toBe('1800.000000');
  });

  it('fixed job profits like a classic project', () => {
    const composed = composeProjectFinancials({
      projectId: 'job-fixed-1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      workKind: 'job',
      pricingMode: 'fixed',
      canReadCommercial: true,
      canReadBilling: false,
      canReadProfit: true,
      commercialData: {
        currency: ILS,
        position: {
          originalContractValue: money('20000', ILS),
          approvedAdditions: zeroMoney(ILS),
          approvedReductions: zeroMoney(ILS),
          currentContractValue: money('20000', ILS),
          pendingChanges: zeroMoney(ILS),
        },
      },
      billingRows: null,
      expenseContributions: [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'job-fixed-1',
          expenseId: 'e-fixed',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    expect(composed.priceNotSet).toBe(false);
    expect(composed.profit?.actualProfit.amount).toBe('12000.000000');
    expect(composed.profit?.estimatedProfit.amount).toBe('12000.000000');
  });
});
