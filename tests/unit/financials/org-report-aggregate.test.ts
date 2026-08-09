import { describe, expect, it } from 'vitest';
import {
  aggregateOrgCash,
  aggregateOrgCommercial,
  aggregateOrgCost,
  aggregateOrgProfit,
} from '@/modules/financials/domain/aggregate-org-report';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

function row(partial: Partial<ProjectRollupRow> & Pick<ProjectRollupRow, 'projectId' | 'name'>): ProjectRollupRow {
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
    estimatedFinalCost: zeroMoney(ILS),
    assetCapitalActual: zeroMoney(ILS),
    estimatedProfit: null,
    marginPercent: null,
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

  it('never folds committed or AP into actual cost', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        actualCost: money('800', ILS),
        committedOpen: money('300', ILS),
        openApPayable: money('100', ILS),
        estimatedFinalCost: money('800', ILS),
      }),
    ];

    const cost = aggregateOrgCost(rows, ILS);
    expect(cost.actual.value).toEqual(money('800', ILS));
    expect(cost.committed.value).toEqual(money('300', ILS));
    expect(cost.openAp.value).toEqual(money('100', ILS));
    expect(cost.actual.kind).toBe('actual');
    expect(cost.committed.kind).toBe('committed');
    expect(cost.openAp.kind).toBe('forecast');
    expect(cost.actual.exclusions).toEqual(
      expect.arrayContaining(['committedPo', 'openAp']),
    );
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

  it('marks profit as estimate and discloses VAT exclusion', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        estimatedProfit: money('350', ILS),
        marginPercent: '30.43',
      }),
    ];
    const profit = aggregateOrgProfit(rows, ILS);
    expect(profit.estimatedProfit.kind).toBe('estimate');
    expect(profit.estimatedProfit.exclusions).toContain('vatNotProfit');
    expect(profit.sampleMarginPercent).toBe('30.43');
  });

  it('treats null profit fields as absent (permission-denied shape)', () => {
    const rows = [
      row({
        projectId: 'a',
        name: 'A',
        estimatedProfit: null,
        marginPercent: null,
        profitable: null,
      }),
    ];
    const profit = aggregateOrgProfit(rows, ILS);
    expect(profit.estimatedProfit.value).toEqual(zeroMoney(ILS));
    expect(profit.sampleMarginPercent).toBeNull();
  });
});
