import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterRowsByWorkKind } from '@/modules/financials/domain/work-kind-filter';
import { matchesWorkKindFilter } from '@/modules/financials/domain/work-pricing';
import {
  billingCollectedMonthHref,
  buildBillingOutstandingDetail,
  buildCompanyActualDetail,
  buildContractRemainingDetail,
  buildForecastCostDetail,
  buildInvoicedThisMonthDetail,
  buildUnallocatedBusinessCostsDetail,
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
  businessCashPaidWhat: 'Paid',
  businessCashPaidFormula: 'Paid formula',
  businessCashOutstandingWhat: 'Outstanding',
  businessCashOutstandingFormula: 'Outstanding formula',
  labelExpenseSuppliers: 'Suppliers',
  labelExpenseSubcontractors: 'Subcontractors',
  labelApPayments: 'AP',
  labelPayrollPayments: 'Payroll',
  labelSubcontractAdvances: 'Advances',
  expensesLink: 'Expenses',
  expectedRemainingWhat: 'ETC',
  expectedRemainingFormula: 'forecast − actual − committed',
  allocatedOverheadWhat: 'GCM allocated',
  allocatedOverheadFormula: 'GCM sum',
  companyActualWhat: 'Business recognized cost',
  companyActualFormula: 'full projects + business remainder',
  labelOtherProjectDirect: 'Other project',
  labelUnallocatableGeneral: 'Business remainder',
  companyProfitWhat: 'Business profit',
  companyProfitFormula: 'revenue − cost',
  unallocatedBusinessCostsWhat: 'Unallocated',
  unallocatedBusinessCostsFormula: 'components sum',
  contractValueWhat: 'Contract value',
  contractValueFormula: 'original + approved',
  profitabilityRateWhat: 'Rate',
  profitabilityRateFormula: 'profit / contracts',
  forecastProfitWhat: 'Forecast profit',
  forecastProfitFormula: 'contracts − forecast cost',
  invoicedThisMonthWhat: 'Invoiced month',
  invoicedThisMonthFormula: 'month billed',
  collectionsThisMonthWhat: 'Collections month',
  collectionsThisMonthFormula: 'month paid',
  costsThisMonthWhat: 'Costs month',
  costsThisMonthFormula: 'month recognized',
  labelLabor: 'Labor',
  labelVendors: 'Vendors',
  labelOverhead: 'Overhead',
  labelDirectProject: 'Projects',
  labelGeneralPool: 'General pool',
  labelCommitted: 'Committed',
  labelExpectedRemaining: 'ETC',
  labelRecognizedRevenue: 'Revenue',
  labelCompanyOnlyByDesign: 'Company only',
  labelActionableUnallocated: 'Actionable',
  labelGcmAutoPool: 'GCM pool',
  labelProfit: 'Profit',
  labelProfitabilityRate: 'Rate',
  labelForecastCost: 'Forecast cost',
  monthReportsLink: 'Month reports',
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
    expect(collectionsCase.match(/<DashboardKpiCard[\s\S]*?kpis\.outstandingNet/g)?.length).toBe(1);
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

  it('forecast cost detail uses recognized, committed, and ETC operands', () => {
    const detail = buildForecastCostDetail(
      money('1000', ILS),
      {
        actualCost: money('600', ILS),
        committed: money('200', ILS),
        expectedRemaining: money('200', ILS),
      },
      'Forecast',
      detailCopy,
    );
    expect(detail.breakdown.map((line) => line.label)).toEqual([
      detailCopy.labelRecognizedCost,
      detailCopy.labelCommitted,
      detailCopy.labelExpectedRemaining,
      'Forecast',
    ]);
  });

  it('company actual detail breakdown sums to the displayed total', () => {
    const detail = buildCompanyActualDetail(
      money('900', ILS),
      {
        directProjectActual: money('700', ILS),
        laborActual: money('300', ILS),
        vendorActual: money('250', ILS),
        allocatedGeneralToProjects: money('150', ILS),
        unallocatableGeneral: money('50', ILS),
      },
      'Company actual',
      {
        ...detailCopy,
        labelOtherProjectDirect: 'Other project',
        labelUnallocatableGeneral: 'Business remainder',
      },
    );
    const parts = detail.breakdown.filter((line) => line.label !== 'Company actual');
    const sum = parts.reduce((acc, line) => acc + Number(line.money?.amount ?? 0), 0);
    expect(sum).toBe(900);
    expect(detail.breakdown.some((line) => line.label === detailCopy.labelLabor)).toBe(true);
    expect(detail.breakdown.some((line) => line.label === 'Business remainder')).toBe(true);
  });

  it('unallocated business costs detail matches the waiting-for-project list', () => {
    const detail = buildUnallocatedBusinessCostsDetail(money('200', ILS), 'Unallocated', detailCopy);
    expect(detail.value).toEqual(money('200', ILS));
    expect(detail.breakdown).toEqual([
      expect.objectContaining({
        money: money('200', ILS),
        href: '/expenses?unallocated=true',
      }),
    ]);
    expect(detail.fullScreenHref).toBe('/expenses?unallocated=true');
  });

  it('monthly billing detail keeps the selected month on the billing list', () => {
    const invoiced = buildInvoicedThisMonthDetail(
      money('100', ILS),
      money('118', ILS),
      '2026-08',
      'Invoiced',
      detailCopy,
    );
    expect(invoiced.fullScreenHref).toBe('/billing?fromDate=2026-08-01&toDate=2026-08-31');
    expect(billingCollectedMonthHref('2026-08')).toBe(
      '/billing?paymentFrom=2026-08-01&paymentTo=2026-08-31&view=payments',
    );
  });

  it('persona dashboard forecast cards wire detail triggers', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/financials/ui/home-dashboard-content.tsx'),
      'utf8',
    );
    expect(source).toContain('buildExpectedRemainingDetail');
    expect(source).toContain('buildAllocatedOverheadDetail');
    expect(source).toContain('buildCompanyActualDetail');
    expect(source).toContain('buildUnallocatedBusinessCostsDetail');
    expect(source).toContain('buildInvoicedThisMonthDetail');
  });

  it('owner dashboard wires detail on work value and profitability', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/modules/financials/ui/home-dashboard-owner-view.tsx'),
      'utf8',
    );
    expect(source).toContain('buildContractValueDetail');
    expect(source).toContain('buildProfitabilityRateDetail');
    expect(source).toContain('buildCompanyActualDetail');
  });
});
