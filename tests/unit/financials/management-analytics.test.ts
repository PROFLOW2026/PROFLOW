import { describe, expect, it } from 'vitest';
import {
  computeOpportunityConversion,
  computeQuotesConversion,
  computeUnbilledBacklog,
  computeVendorConcentration,
  emptyManagementAnalytics,
  groupProfitByClient,
  groupProfitByProject,
  sortByProfitDesc,
  timedCashFromOutlook,
} from '@/modules/financials/domain/management-analytics';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import { buildCashFlowOutlook } from '@/modules/financials/domain/cash-flow';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

describe('management analytics uncovered metrics stay null', () => {
  it('starts empty with all metrics null', () => {
    const empty = emptyManagementAnalytics();
    expect(empty.activeProjectValue).toBeNull();
    expect(empty.unbilledBacklog).toBeNull();
    expect(empty.companyOnlyCost).toBeNull();
    expect(empty.allocatedCost).toBeNull();
    expect(empty.unallocatedCost).toBeNull();
    expect(empty.expectedProfit).toBeNull();
    expect(empty.quotesConversion).toBeNull();
    expect(empty.workforceHours).toBeNull();
    expect(empty.vendorConcentration).toBeNull();
    expect(empty.projectsAtRisk).toBeNull();
  });

  it('hides backlog when invoiced exceeds current contract', () => {
    expect(
      computeUnbilledBacklog(money('100', 'ILS'), money('150', 'ILS')),
    ).toBeNull();
  });

  it('uses net invoiced for backlog when gross would skew (R-018)', () => {
    expect(
      computeUnbilledBacklog(money('100', 'ILS'), money('40', 'ILS'), money('47.2', 'ILS'))?.amount,
    ).toBe('60.000000');
    expect(computeUnbilledBacklog(money('100', 'ILS'), null, money('40', 'ILS'))?.amount).toBe(
      '60.000000',
    );
  });

  it('returns backlog only when both sides exist and invoiced is not above current', () => {
    expect(computeUnbilledBacklog(money('100', 'ILS'), money('40', 'ILS'))?.amount).toBe(
      '60.000000',
    );
    expect(computeUnbilledBacklog(null, money('40', 'ILS'))).toBeNull();
    expect(computeUnbilledBacklog(money('100', 'ILS'), null)).toBeNull();
  });

  it('returns null quote conversion when only drafts exist', () => {
    expect(computeQuotesConversion([{ status: 'draft' }, { status: 'ready' }])).toBeNull();
  });

  it('computes quote conversion from decided pipeline only', () => {
    const result = computeQuotesConversion([
      { status: 'sent' },
      { status: 'converted' },
      { status: 'rejected' },
      { status: 'draft' },
    ]);
    expect(result).toEqual({
      pipelineCount: 3,
      convertedCount: 1,
      ratePercent: '33.3',
    });
  });

  it('returns null opportunity conversion without won/lost decisions', () => {
    expect(computeOpportunityConversion([{ status: 'open' }])).toBeNull();
  });

  it('returns null vendor concentration without recorded amounts', () => {
    expect(computeVendorConcentration([], 'ILS')).toBeNull();
  });

  it('returns null timed cash when outlook or outgoing is unavailable', () => {
    expect(timedCashFromOutlook(null, 'in')).toBeNull();
    const outlook = buildCashFlowOutlook({
      currency: 'ILS',
      asOf: businessDate('2026-08-09'),
      outstandingRecords: [],
      payments: [],
    });
    expect(timedCashFromOutlook(outlook, 'out')).toBeNull();
  });
});

describe('profit rankings sort before the short list', () => {
  function project(id: string, name: string, profit: string): ProjectRollupRow {
    return {
      projectId: id,
      name,
      actualProfit: money(profit, 'ILS'),
    } as ProjectRollupRow;
  }

  it('orders projects and clients by profit descending before take(8)', () => {
    const projects = groupProfitByProject([
      project('low', 'Low', '10'),
      project('high', 'High', '80'),
      project('mid', 'Mid', '40'),
      project('loss', 'Loss', '-15'),
    ]);
    expect(projects?.map((row) => row.id)).toEqual(['high', 'mid', 'low', 'loss']);

    const many = sortByProfitDesc(
      Array.from({ length: 10 }, (_, index) => ({
        id: String(index),
        amount: money(String(index), 'ILS'),
      })),
    ).slice(0, 8);
    expect(many.map((row) => row.id)).toEqual(['9', '8', '7', '6', '5', '4', '3', '2']);

    const clients = groupProfitByClient(
      [
        { clientId: 'c-low', clientName: 'Low', actualProfit: money('5', 'ILS') },
        { clientId: 'c-high', clientName: 'High', actualProfit: money('50', 'ILS') },
        { clientId: 'c-loss', clientName: 'Loss', actualProfit: money('-20', 'ILS') },
      ],
      'ILS',
    );
    expect(clients?.map((row) => row.id)).toEqual(['c-high', 'c-low', 'c-loss']);
  });
});
