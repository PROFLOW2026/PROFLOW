import { describe, expect, it } from 'vitest';
import {
  aggregateOrgCash,
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
} from '@/modules/financials/domain/aggregate-org-report';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import {
  computeUnallocatedOrganizationCosts,
  expenseTotalsReconcile,
  sumProjectTouchingExpenseNets,
} from '@/modules/financials/domain/org-cost-reconciliation';
import type { ProjectExpenseContribution } from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

function row(partial: Partial<ProjectRollupRow> & Pick<ProjectRollupRow, 'projectId' | 'name'>): ProjectRollupRow {
  return {
    status: 'active',
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
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

describe('aggregateOrgReport invariants', () => {
  it('keeps commercial pending out of current contract totals', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        originalContract: money('1000', ILS),
        approvedAdditions: money('200', ILS),
        approvedReductions: money('50', ILS),
        currentContract: money('1150', ILS),
        pendingChanges: money('500', ILS),
      }),
    ];

    const commercial = aggregateOrgCommercial(rows, ILS);
    expect(commercial.current.value).toEqual(money('1150', ILS));
    expect(commercial.pending.value).toEqual(money('500', ILS));
    expect(commercial.pending.exclusions).toContain('currentContract');
    expect(commercial.current.exclusions).toContain('pendingChanges');
    expect(commercial.current.kind).toBe('commercial');
  });

  it('never folds committed, AP, or unallocated into actual cost', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        actualCost: money('800', ILS),
        committedOpen: money('300', ILS),
        expectedRemainingCost: money('50', ILS),
        openApPayable: money('100', ILS),
        estimatedFinalCost: money('1150', ILS),
      }),
    ];

    const cost = aggregateOrgCost(rows, ILS, {
      unallocatedBusinessCosts: money('250', ILS),
    });
    expect(cost.actual?.value).toEqual(money('800', ILS));
    expect(cost.committed?.value).toEqual(money('300', ILS));
    expect(cost.expectedRemaining?.value).toEqual(money('50', ILS));
    expect(cost.openAp?.value).toEqual(money('100', ILS));
    expect(cost.estimatedFinal?.value).toEqual(money('1150', ILS));
    expect(cost.unallocatedBusinessCosts?.value).toEqual(money('250', ILS));
    expect(cost.actual?.exclusions).toEqual(
      expect.arrayContaining(['committedPo', 'openAp', 'unallocatedBusinessCosts']),
    );
    expect(cost.estimatedFinal?.exclusions).toContain('unallocatedBusinessCosts');
  });

  it('labels cash invoiced/paid as actual and skips foreign currency rows', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        invoiced: money('1000', ILS),
        paid: money('400', ILS),
        outstanding: money('600', ILS),
      }),
      row({
        projectId: 'b',
        name: 'B',
        currency: 'USD',
        invoiced: money('999', 'USD'),
        paid: money('999', 'USD'),
        outstanding: money('0', 'USD'),
      }),
    ];

    const cash = aggregateOrgCash(rows, ILS);
    expect(cash.invoiced.value).toEqual(money('1000', ILS));
    expect(cash.paid.value).toEqual(money('400', ILS));
    expect(cash.outstanding.value).toEqual(money('600', ILS));
    expect(cash.invoiced.kind).toBe('actual');
    expect(cash.paid.exclusions).toContain('forecastIncoming');
  });

  it('marks forecast and actual margins separately and excludes unallocated from profit', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        estimatedProfit: money('350', ILS),
        actualProfit: money('500', ILS),
        marginPercent: '30.43',
        actualMarginPercent: '43.48',
      }),
    ];
    const profit = aggregateOrgProfit(rows, ILS);
    expect(profit.estimatedProfit?.kind).toBe('estimate');
    expect(profit.actualProfit?.kind).toBe('actual');
    expect(profit.estimatedProfit?.value).toEqual(money('350', ILS));
    expect(profit.actualProfit?.value).toEqual(money('500', ILS));
    expect(profit.estimatedProfit?.exclusions).toContain('vatNotProfit');
    expect(profit.estimatedProfit?.exclusions).toContain('unallocatedBusinessCosts');
    expect(profit.actualProfit?.exclusions).toContain('unallocatedBusinessCosts');
    expect(profit.sampleMarginPercent).toBe('30.43');
    expect(profit.sampleActualMarginPercent).toBe('43.48');
  });

  it('treats null profit fields as absent (permission-denied shape)', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        estimatedProfit: null,
        marginPercent: null,
        actualProfit: null,
        actualMarginPercent: null,
        profitable: null,
      }),
    ];
    const profit = aggregateOrgProfit(rows, ILS);
    expect(profit.estimatedProfit).toBeNull();
    expect(profit.actualProfit).toBeNull();
    expect(profit.sampleMarginPercent).toBeNull();
    expect(profit.sampleActualMarginPercent).toBeNull();
  });

  it('does not invent zero Actual when every rollup row withheld cost (N-002)', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        actualCost: null,
        laborActual: null,
        vendorActual: null,
        overheadActual: null,
        estimatedFinalCost: null,
        committedOpen: money('100', ILS),
      }),
    ];
    const cost = aggregateOrgCost(rows, ILS);
    expect(cost.actual).toBeNull();
    expect(cost.labor).toBeNull();
    expect(cost.estimatedFinal).toBeNull();
    expect(cost.committed?.value).toEqual(money('100', ILS));
  });

  it('aggregates forecast fields correctly across 120 projects (no 50-cap)', () => {
    const rows = Array.from({ length: 120 }, (_, index) =>
      row({
        projectId: `p-${index}`,
        name: `Project ${index}`,
        currentContract: money('1000', ILS),
        actualCost: money('400', ILS),
        overheadActual: money('50', ILS),
        committedOpen: money('100', ILS),
        expectedRemainingCost: money('25', ILS),
        estimatedFinalCost: money('525', ILS),
        actualProfit: money('600', ILS),
        estimatedProfit: money('475', ILS),
      }),
    );

    const commercial = aggregateOrgCommercial(rows, ILS);
    const cost = aggregateOrgCost(rows, ILS, {
      unallocatedBusinessCosts: money('9000', ILS),
    });
    const profit = aggregateOrgProfit(rows, ILS);

    expect(rows).toHaveLength(120);
    expect(commercial.current.value).toEqual(money('120000', ILS));
    expect(cost.actual?.value).toEqual(money('48000', ILS));
    expect(cost.overhead?.value).toEqual(money('6000', ILS));
    expect(cost.committed?.value).toEqual(money('12000', ILS));
    expect(cost.expectedRemaining?.value).toEqual(money('3000', ILS));
    expect(cost.estimatedFinal?.value).toEqual(money('63000', ILS));
    expect(cost.unallocatedBusinessCosts?.value).toEqual(money('9000', ILS));
    expect(profit.actualProfit?.value).toEqual(money('72000', ILS));
    expect(profit.estimatedProfit?.value).toEqual(money('57000', ILS));

    // Unallocated must not inflate project Actual or Forecast Final.
    expect(cost.actual?.value).not.toEqual(
      money(String(48000 + 9000), ILS),
    );
    expect(cost.estimatedFinal?.value).not.toEqual(
      money(String(63000 + 9000), ILS),
    );
  });
});

describe('org expense reconciliation', () => {
  it('PROJECT-TOUCHING + UNALLOCATED = ORG FINALIZED EXPENSE TOTAL', () => {
    const contributions: ProjectExpenseContribution[] = [
      {
        amount: '1000.000000',
        currency: ILS,
        costFamily: 'direct_project',
        isDirectOnProject: true,
        isAllocated: false,
        isSubcontractor: false,
        projectId: 'p1',
        isLaborCategory: false,
      },
      {
        amount: '300.000000',
        currency: ILS,
        costFamily: 'business_overhead',
        isDirectOnProject: false,
        isAllocated: true,
        isSubcontractor: false,
        projectId: 'p2',
        isLaborCategory: false,
      },
      {
        amount: '50.000000',
        currency: 'USD',
        costFamily: 'direct_project',
        isDirectOnProject: true,
        isAllocated: false,
        isSubcontractor: false,
        projectId: 'fx',
        isLaborCategory: false,
      },
    ];

    const projectTouching = sumProjectTouchingExpenseNets(contributions, ILS);
    expect(projectTouching).toEqual(money('1300', ILS));

    const orgTotal = money('1800', ILS);
    const unallocated = computeUnallocatedOrganizationCosts({
      orgFinalizedExpenseTotal: orgTotal,
      projectTouchingExpenseTotal: projectTouching,
    });
    expect(unallocated).toEqual(money('500', ILS));
    expect(
      expenseTotalsReconcile({
        projectTouching,
        unallocated,
        orgFinalizedExpenseTotal: orgTotal,
      }),
    ).toBe(true);
  });
});
