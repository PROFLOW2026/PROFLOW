import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterRowsByWorkKind } from '@/modules/financials/domain/work-kind-filter';
import { matchesWorkKindFilter } from '@/modules/financials/domain/work-pricing';
import {
  buildBillingOutstandingDetail,
  buildContractRemainingDetail,
} from '@/modules/financials/domain/dashboard-kpi-detail-builders';
import { buildOrgContractSummary } from '@/modules/financials/domain/dashboard-contract-summary';
import { aggregateOrgCommercial } from '@/modules/financials/domain/aggregate-org-report';
import type { ProjectRollupRow } from '@/modules/financials/application/get-organization-project-rollup';
import { computeBillingPositionFromRows } from '@/modules/financials/data/billing.repository';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

const detailCopy = {
  contractOriginalWhat: '',
  contractOriginalFormula: '',
  contractApprovedWhat: '',
  contractApprovedFormula: '',
  contractTotalWhat: '',
  contractTotalFormula: '',
  contractRemainingWhat: 'Still to bill',
  contractRemainingFormula: 'total − net billed',
  billedWhat: '',
  billedFormula: '',
  paidWhat: '',
  paidFormula: '',
  outstandingWhat: 'Outstanding',
  outstandingFormula: 'billed − paid',
  apWhat: '',
  apFormula: '',
  actualCostWhat: '',
  actualCostFormula: '',
  currentProfitWhat: '',
  currentProfitFormula: '',
  forecastCostWhat: '',
  forecastCostFormula: '',
  commitmentsWhat: '',
  commitmentsFormula: '',
  labelOriginal: 'Original',
  labelApproved: 'Approved',
  labelTotal: 'Total',
  labelNetBilled: 'Net billed',
  labelBilled: 'Billed',
  labelPaid: 'Paid',
  labelOutstanding: 'Outstanding',
  labelContracts: 'Contracts',
  labelRecognizedCost: 'Cost',
  reportsLink: 'Reports',
  billingLink: 'Billing',
  apLink: 'AP',
};

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

describe('dashboard cleanup — duplicates', () => {
  it('standard collections card renders only one AR outstanding block', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/financials/ui/home-dashboard-content.tsx'),
      'utf8',
    );
    const collectionsCase = source.slice(
      source.indexOf("case 'collections'"),
      source.indexOf("case 'serviceToday'"),
    );
    expect(collectionsCase).not.toContain('organizationSummary.netOutstanding');
    expect(collectionsCase).not.toContain("title={t('businessSummary.outstanding')}");
    expect(collectionsCase.match(/<KpiCard[\s\S]*?kpis\.outstandingNet/g)?.length).toBe(1);
  });

  it('owner view hides workValue headline when contract summary exists', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/financials/ui/home-dashboard-owner-view.tsx'),
      'utf8',
    );
    expect(source).toContain('showContractHeadline');
    expect(source).toContain('!data.contractSummary');
  });
});

describe('dashboard cleanup — contract backlog on owner slim', () => {
  it('builds remaining contract when netInvoiced comes from billing rows only', () => {
    const commercial = aggregateOrgCommercial(
      [
        row({
          projectId: 'a',
          name: 'A',
          originalContract: money('1000', ILS),
          currentContract: money('1000', ILS),
        }),
      ],
      ILS,
    );
    const summary = buildOrgContractSummary(commercial, money('200', ILS));
    expect(summary!.remainingContract).toEqual(money('800', ILS));
  });
});

describe('dashboard cleanup — work-kind scope', () => {
  it('filters rollup rows consistently for project scope', () => {
    const rows = [
      row({ projectId: 'p1', name: 'P1', workKind: 'project' }),
      row({ projectId: 'j1', name: 'J1', workKind: 'job' }),
    ];
    const scoped = filterRowsByWorkKind(rows, 'project');
    expect(scoped).toHaveLength(1);
    expect(scoped[0]!.projectId).toBe('p1');
  });

  it('matches job filter only for job work kind', () => {
    expect(matchesWorkKindFilter('job', 'job')).toBe(true);
    expect(matchesWorkKindFilter('project', 'job')).toBe(false);
    expect(matchesWorkKindFilter(null, 'project')).toBe(true);
  });

  it('scoped empty billing rows yield zero net outstanding', () => {
    const position = computeBillingPositionFromRows({ records: [], currency: ILS }, ILS);
    expect(position.netOutstanding).toEqual(zeroMoney(ILS));
  });
});

describe('dashboard cleanup — detail modals', () => {
  it('contract remaining detail includes net billed breakdown line', () => {
    const commercial = aggregateOrgCommercial(
      [row({ projectId: 'a', name: 'A', currentContract: money('1000', ILS) })],
      ILS,
    );
    const summary = buildOrgContractSummary(commercial, money('250', ILS))!;
    const detail = buildContractRemainingDetail(summary, money('250', ILS), 'Still to bill', detailCopy);
    expect(detail.breakdown.some((line) => line.label === detailCopy.labelNetBilled)).toBe(true);
  });

  it('AR outstanding detail formula references billed and paid', () => {
    const detail = buildBillingOutstandingDetail(
      money('300', ILS),
      money('354', ILS),
      money('1000', ILS),
      money('700', ILS),
      'Outstanding',
      detailCopy,
    );
    expect(detail.formula).toContain('billed');
    expect(detail.breakdown).toHaveLength(4);
  });
});
