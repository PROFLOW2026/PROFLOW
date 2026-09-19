import { describe, expect, it } from 'vitest';
import { aggregateOrgCommercial } from '@/modules/financials/domain/aggregate-org-report';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import {
  buildOrgContractSummary,
  isContractSummaryReconciled,
} from '@/modules/financials/domain/dashboard-contract-summary';
import { listDashboardAttentionItems } from '@/modules/financials/domain/dashboard-attention-routes';
import { RECENT_ACTIVE_PROJECTS_LIMIT } from '@/modules/financials/data/projects.repository';
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

describe('dashboard contract summary', () => {
  it('reconciles original + approved changes = total including approved', () => {
    const commercial = aggregateOrgCommercial(
      [
        row({
          projectId: 'a',
          name: 'A',
          originalContract: money('5200000', ILS),
          approvedAdditions: money('100000', ILS),
          approvedReductions: money('8500', ILS),
          currentContract: money('5291500', ILS),
          pendingChanges: money('54000', ILS),
        }),
      ],
      ILS,
    );

    const summary = buildOrgContractSummary(commercial, money('1000000', ILS));
    expect(summary).not.toBeNull();
    expect(summary!.originalContractTotal).toEqual(money('5200000', ILS));
    expect(summary!.approvedChangesTotal).toEqual(money('91500', ILS));
    expect(summary!.totalIncludingApproved).toEqual(money('5291500', ILS));
    expect(isContractSummaryReconciled(summary!)).toBe(true);
  });

  it('excludes pending changes from contract totals', () => {
    const commercial = aggregateOrgCommercial(
      [
        row({
          projectId: 'a',
          name: 'A',
          originalContract: money('1000', ILS),
          approvedAdditions: money('0', ILS),
          approvedReductions: money('0', ILS),
          currentContract: money('1000', ILS),
          pendingChanges: money('54000', ILS),
        }),
      ],
      ILS,
    );

    const summary = buildOrgContractSummary(commercial, null);
    expect(summary!.totalIncludingApproved).toEqual(money('1000', ILS));
    expect(commercial.pending.value).toEqual(money('54000', ILS));
  });
});

describe('dashboard attention routes', () => {
  it('returns clickable routes for each attention item', () => {
    const items = listDashboardAttentionItems({
      overdueBillingCount: 1,
      unbilledApprovedCount: 3,
      pendingChangesCount: 2,
    });

    expect(items).toHaveLength(3);
    expect(items.find((item) => item.key === 'overdueBilling')?.href).toBe('/billing?filter=overdue');
    expect(items.find((item) => item.key === 'unbilledApproved')?.href).toBe('/changes');
    expect(items.find((item) => item.key === 'pendingChanges')?.href).toBe('/changes');
  });

  it('returns empty list when there is nothing to show', () => {
    expect(
      listDashboardAttentionItems({
        overdueBillingCount: 0,
        unbilledApprovedCount: 0,
        pendingChangesCount: 0,
      }),
    ).toEqual([]);
  });
});

describe('recent active projects limit', () => {
  it('uses limit 6 for dashboard recent projects', () => {
    expect(RECENT_ACTIVE_PROJECTS_LIMIT).toBe(6);
  });
});
