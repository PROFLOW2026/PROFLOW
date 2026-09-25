import type { OrgContractSummary } from './dashboard-contract-summary';
import type { DashboardKpiDetailContent, DashboardKpiDetailLine } from './dashboard-kpi-detail';
import type { BusinessCashPosition, BusinessCashSourceKey } from './business-cash-position';
import type { HomeDashboardKpiBreakdown } from './home-dashboard-kpi-breakdown';
import { endOfMonth, type BusinessDate } from '@/shared/dates';
import { subtractMoney, type MoneyValue } from '@/shared/money';

/** First and last calendar day of `YYYY-MM`, matching dashboard month KPIs. */
export function dashboardMonthBounds(
  yearMonth: string,
): { readonly fromDate: string; readonly toDate: string } | null {
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) return null;
  const fromDate = `${yearMonth}-01`;
  return { fromDate, toDate: endOfMonth(fromDate as BusinessDate) };
}

export function billingIssuedMonthHref(yearMonth: string): string {
  const bounds = dashboardMonthBounds(yearMonth);
  return bounds ? `/billing?fromDate=${bounds.fromDate}&toDate=${bounds.toDate}` : '/billing';
}

export function billingCollectedMonthHref(yearMonth: string): string {
  const bounds = dashboardMonthBounds(yearMonth);
  return bounds
    ? `/billing?paymentFrom=${bounds.fromDate}&paymentTo=${bounds.toDate}&view=payments`
    : '/billing';
}

export interface DashboardKpiDetailCopy {
  readonly contractOriginalWhat: string;
  readonly contractOriginalFormula: string;
  readonly contractApprovedWhat: string;
  readonly contractApprovedFormula: string;
  readonly contractTotalWhat: string;
  readonly contractTotalFormula: string;
  readonly contractRemainingWhat: string;
  readonly contractRemainingFormula: string;
  readonly billedWhat: string;
  readonly billedFormula: string;
  readonly paidWhat: string;
  readonly paidFormula: string;
  readonly outstandingWhat: string;
  readonly outstandingFormula: string;
  readonly apWhat: string;
  readonly apFormula: string;
  readonly actualCostWhat: string;
  readonly actualCostFormula: string;
  readonly currentProfitWhat: string;
  readonly currentProfitFormula: string;
  readonly forecastCostWhat: string;
  readonly forecastCostFormula: string;
  readonly commitmentsWhat: string;
  readonly commitmentsFormula: string;
  readonly labelOriginal: string;
  readonly labelApproved: string;
  readonly labelTotal: string;
  readonly labelNetBilled: string;
  readonly labelBilled: string;
  readonly labelPaid: string;
  readonly labelOutstanding: string;
  readonly labelContracts: string;
  readonly labelRecognizedCost: string;
  readonly reportsLink: string;
  readonly billingLink: string;
  readonly apLink: string;
  readonly businessCashPaidWhat: string;
  readonly businessCashPaidFormula: string;
  readonly businessCashOutstandingWhat: string;
  readonly businessCashOutstandingFormula: string;
  readonly labelExpenseSuppliers: string;
  readonly labelExpenseSubcontractors: string;
  readonly labelApPayments: string;
  readonly labelPayrollPayments: string;
  readonly labelSubcontractAdvances: string;
  readonly expensesLink: string;
  readonly expectedRemainingWhat: string;
  readonly expectedRemainingFormula: string;
  readonly allocatedOverheadWhat: string;
  readonly allocatedOverheadFormula: string;
  readonly companyActualWhat: string;
  readonly companyActualFormula: string;
  readonly companyProfitWhat: string;
  readonly companyProfitFormula: string;
  readonly unallocatedBusinessCostsWhat: string;
  readonly unallocatedBusinessCostsFormula: string;
  readonly contractValueWhat: string;
  readonly contractValueFormula: string;
  readonly profitabilityRateWhat: string;
  readonly profitabilityRateFormula: string;
  readonly forecastProfitWhat: string;
  readonly forecastProfitFormula: string;
  readonly invoicedThisMonthWhat: string;
  readonly invoicedThisMonthFormula: string;
  readonly collectionsThisMonthWhat: string;
  readonly collectionsThisMonthFormula: string;
  readonly costsThisMonthWhat: string;
  readonly costsThisMonthFormula: string;
  readonly labelLabor: string;
  readonly labelVendors: string;
  readonly labelOverhead: string;
  readonly labelDirectProject: string;
  readonly labelGeneralPool: string;
  readonly labelCommitted: string;
  readonly labelExpectedRemaining: string;
  readonly labelRecognizedRevenue: string;
  readonly labelCompanyOnlyByDesign: string;
  readonly labelActionableUnallocated: string;
  readonly labelGcmAutoPool: string;
  readonly labelProfit: string;
  readonly labelProfitabilityRate: string;
  readonly labelForecastCost: string;
  readonly monthReportsLink: string;
}

function lines(...items: DashboardKpiDetailLine[]): DashboardKpiDetailLine[] {
  return items;
}

function moneyLine(label: string, money: MoneyValue | null | undefined): DashboardKpiDetailLine | null {
  if (!money || Number(money.amount) <= 0) return null;
  return { label, money };
}

export interface MonthlyVatLabels {
  readonly exVat: string;
  readonly vat: string;
  readonly incVat: string;
  readonly noVat: string;
}

function monthlyVatLines(
  net: MoneyValue,
  gross: MoneyValue,
  labels: MonthlyVatLabels,
): DashboardKpiDetailLine[] {
  return [
    {
      label: labels.exVat,
      money: net,
      vat: subtractMoney(gross, net),
      gross,
      vatLabel: labels.vat,
      grossLabel: labels.incVat,
      noVatLabel: labels.noVat,
    },
  ];
}
function moneyLines(
  items: Array<DashboardKpiDetailLine | null>,
): DashboardKpiDetailLine[] {
  return items.filter((item): item is DashboardKpiDetailLine => item != null);
}

export function buildContractOriginalDetail(
  summary: OrgContractSummary,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: summary.originalContractTotal,
    whatIs: copy.contractOriginalWhat,
    formula: copy.contractOriginalFormula,
    breakdown: lines({ label: copy.labelOriginal, money: summary.originalContractTotal }),
    fullScreenHref: '/reports?section=commercial',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildContractApprovedDetail(
  summary: OrgContractSummary,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: summary.approvedChangesTotal,
    whatIs: copy.contractApprovedWhat,
    formula: copy.contractApprovedFormula,
    breakdown: lines({ label: copy.labelApproved, money: summary.approvedChangesTotal }),
    fullScreenHref: '/changes',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildContractTotalDetail(
  summary: OrgContractSummary,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: summary.totalIncludingApproved,
    whatIs: copy.contractTotalWhat,
    formula: copy.contractTotalFormula,
    breakdown: lines(
      { label: copy.labelOriginal, money: summary.originalContractTotal },
      { label: copy.labelApproved, money: summary.approvedChangesTotal },
      { label: copy.labelTotal, money: summary.totalIncludingApproved },
    ),
    fullScreenHref: '/reports?section=commercial',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildContractRemainingDetail(
  summary: OrgContractSummary,
  netInvoiced: MoneyValue | null,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: summary.remainingContract,
    whatIs: copy.contractRemainingWhat,
    formula: copy.contractRemainingFormula,
    breakdown: lines(
      { label: copy.labelTotal, money: summary.totalIncludingApproved },
      { label: copy.labelNetBilled, money: netInvoiced },
      { label: title, money: summary.remainingContract },
    ),
    fullScreenHref: '/billing',
    fullScreenLabel: copy.billingLink,
  };
}

export function buildBillingOutstandingDetail(
  netOutstanding: MoneyValue,
  grossOutstanding: MoneyValue,
  netInvoiced: MoneyValue,
  netPaid: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: netOutstanding,
    whatIs: copy.outstandingWhat,
    formula: copy.outstandingFormula,
    breakdown: lines(
      { label: copy.labelBilled, money: netInvoiced },
      { label: copy.labelPaid, money: netPaid },
      { label: copy.labelOutstanding, money: netOutstanding },
      { label: `${copy.labelOutstanding} (${copy.labelBilled})`, money: grossOutstanding },
    ),
    fullScreenHref: '/billing?filter=open',
    fullScreenLabel: copy.billingLink,
  };
}

export function buildBillingInvoicedDetail(
  netInvoiced: MoneyValue,
  grossInvoiced: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: netInvoiced,
    whatIs: copy.billedWhat,
    formula: copy.billedFormula,
    breakdown: lines(
      { label: copy.labelBilled, money: netInvoiced },
      { label: `${copy.labelBilled} (${copy.labelOutstanding})`, money: grossInvoiced },
    ),
    fullScreenHref: '/billing',
    fullScreenLabel: copy.billingLink,
  };
}

export function buildBillingPaidDetail(
  netPaid: MoneyValue,
  grossPaid: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: netPaid,
    whatIs: copy.paidWhat,
    formula: copy.paidFormula,
    breakdown: lines(
      { label: copy.labelPaid, money: netPaid },
      { label: `${copy.labelPaid} (${copy.labelOutstanding})`, money: grossPaid },
    ),
    fullScreenHref: '/billing',
    fullScreenLabel: copy.billingLink,
  };
}

export function buildApOutstandingDetail(
  apOutstanding: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: apOutstanding,
    whatIs: copy.apWhat,
    formula: copy.apFormula,
    breakdown: lines({ label: title, money: apOutstanding, href: '/procurement/ap?outstanding=1' }),
    fullScreenHref: '/procurement/ap?outstanding=1',
    fullScreenLabel: copy.apLink,
  };
}

export function buildCurrentProfitDetail(
  profit: MoneyValue,
  contractTotal: MoneyValue | null,
  actualCost: MoneyValue | null,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: profit,
    whatIs: copy.currentProfitWhat,
    formula: copy.currentProfitFormula,
    breakdown: lines(
      { label: copy.labelContracts, money: contractTotal },
      { label: copy.labelRecognizedCost, money: actualCost },
      { label: title, money: profit },
    ),
    fullScreenHref: '/reports?section=profitability',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildActualCostDetail(
  actualCost: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
  operands?: Pick<
    HomeDashboardKpiBreakdown,
    'laborActual' | 'vendorActual' | 'overheadAllocated'
  > | null,
): DashboardKpiDetailContent {
  const componentLines = operands
    ? moneyLines([
        moneyLine(copy.labelLabor, operands.laborActual),
        moneyLine(copy.labelVendors, operands.vendorActual),
        moneyLine(copy.labelOverhead, operands.overheadAllocated),
      ])
    : [];
  return {
    title,
    value: actualCost,
    whatIs: copy.actualCostWhat,
    formula: copy.actualCostFormula,
    breakdown:
      componentLines.length > 0
        ? [...componentLines, { label: title, money: actualCost }]
        : lines({ label: title, money: actualCost }),
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildForecastCostDetail(
  forecastCost: MoneyValue,
  operands: {
    actualCost: MoneyValue | null;
    committed: MoneyValue | null;
    expectedRemaining: MoneyValue | null;
  },
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: forecastCost,
    whatIs: copy.forecastCostWhat,
    formula: copy.forecastCostFormula,
    breakdown: lines(
      { label: copy.labelRecognizedCost, money: operands.actualCost },
      { label: copy.labelCommitted, money: operands.committed },
      { label: copy.labelExpectedRemaining, money: operands.expectedRemaining },
      { label: title, money: forecastCost },
    ),
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildCommitmentsDetail(
  committed: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: committed,
    whatIs: copy.commitmentsWhat,
    formula: copy.commitmentsFormula,
    breakdown: lines({ label: title, money: committed }),
    fullScreenHref: '/procurement/purchase-orders',
    fullScreenLabel: copy.reportsLink,
  };
}

const BUSINESS_CASH_SOURCE_LABEL: Record<
  BusinessCashSourceKey,
  keyof Pick<
    DashboardKpiDetailCopy,
    | 'labelExpenseSuppliers'
    | 'labelExpenseSubcontractors'
    | 'labelApPayments'
    | 'labelPayrollPayments'
    | 'labelSubcontractAdvances'
  >
> = {
  expense_suppliers: 'labelExpenseSuppliers',
  expense_subcontractors: 'labelExpenseSubcontractors',
  ap: 'labelApPayments',
  payroll: 'labelPayrollPayments',
  subcontract_advances: 'labelSubcontractAdvances',
};

function cashSourceListHref(
  key: BusinessCashSourceKey,
  field: 'paid' | 'outstanding',
): string | undefined {
  if (key === 'ap' && field === 'outstanding') return '/procurement/ap?outstanding=1';
  if (key === 'expense_suppliers') {
    return field === 'outstanding'
      ? '/expenses?cash=open&cashSource=suppliers'
      : '/expenses?cash=paid&cashSource=suppliers';
  }
  if (key === 'expense_subcontractors') {
    return field === 'outstanding'
      ? '/expenses?cash=open&cashSource=subcontractors'
      : '/expenses?cash=paid&cashSource=subcontractors';
  }
  return undefined;
}

function businessCashBreakdownLines(
  position: BusinessCashPosition,
  copy: DashboardKpiDetailCopy,
  field: 'paid' | 'outstanding',
): DashboardKpiDetailLine[] {
  const items: DashboardKpiDetailLine[] = [];
  for (const [key, totals] of Object.entries(position.sources) as [
    BusinessCashSourceKey,
    NonNullable<BusinessCashPosition['sources'][BusinessCashSourceKey]>,
  ][]) {
    const money = totals[field];
    if (!money || Number(money.amount) <= 0) continue;
    const labelKey = BUSINESS_CASH_SOURCE_LABEL[key];
    items.push({ label: copy[labelKey], money, href: cashSourceListHref(key, field) });
  }
  return items;
}

export function buildBusinessCashPaidDetail(
  position: BusinessCashPosition,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  const value = position.actualPaid;
  if (!value) {
    return {
      title,
      value: { amount: '0', currency: position.currency },
      whatIs: copy.businessCashPaidWhat,
      formula: copy.businessCashPaidFormula,
      breakdown: [],
    };
  }
  return {
    title,
    value,
    whatIs: copy.businessCashPaidWhat,
    formula: copy.businessCashPaidFormula,
    breakdown: businessCashBreakdownLines(position, copy, 'paid'),
  };
}

export function buildBusinessCashOutstandingDetail(
  position: BusinessCashPosition,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  const value = position.outstandingPayable;
  if (!value) {
    return {
      title,
      value: { amount: '0', currency: position.currency },
      whatIs: copy.businessCashOutstandingWhat,
      formula: copy.businessCashOutstandingFormula,
      breakdown: [],
    };
  }
  return {
    title,
    value,
    whatIs: copy.businessCashOutstandingWhat,
    formula: copy.businessCashOutstandingFormula,
    breakdown: businessCashBreakdownLines(position, copy, 'outstanding'),
  };
}

export function buildContractValueDetail(
  contractValue: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: contractValue,
    whatIs: copy.contractValueWhat,
    formula: copy.contractValueFormula,
    breakdown: lines({ label: copy.labelTotal, money: contractValue }),
    fullScreenHref: '/reports?section=commercial',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildExpectedRemainingDetail(
  expectedRemaining: MoneyValue,
  operands: {
    actualCost: MoneyValue | null;
    committed: MoneyValue | null;
  },
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: expectedRemaining,
    whatIs: copy.expectedRemainingWhat,
    formula: copy.expectedRemainingFormula,
    breakdown: lines(
      { label: copy.labelRecognizedCost, money: operands.actualCost },
      { label: copy.labelCommitted, money: operands.committed },
      { label: title, money: expectedRemaining },
    ),
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildAllocatedOverheadDetail(
  allocatedOverhead: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: allocatedOverhead,
    whatIs: copy.allocatedOverheadWhat,
    formula: copy.allocatedOverheadFormula,
    breakdown: lines({ label: copy.labelOverhead, money: allocatedOverhead }),
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildCompanyActualDetail(
  companyActual: MoneyValue,
  operands: Pick<
    HomeDashboardKpiBreakdown,
    'directProjectActual' | 'generalPool' | 'laborActual' | 'vendorActual' | 'overheadAllocated'
  >,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  const componentLines = moneyLines([
    moneyLine(copy.labelLabor, operands.laborActual),
    moneyLine(copy.labelVendors, operands.vendorActual),
    moneyLine(copy.labelOverhead, operands.overheadAllocated),
  ]);
  const structuralLines = lines(
    { label: copy.labelDirectProject, money: operands.directProjectActual },
    { label: copy.labelGeneralPool, money: operands.generalPool },
  ).filter((line) => line.money != null && Number(line.money.amount) > 0);
  return {
    title,
    value: companyActual,
    whatIs: copy.companyActualWhat,
    formula: copy.companyActualFormula,
    breakdown: [
      ...structuralLines,
      ...componentLines,
      { label: title, money: companyActual },
    ],
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildCompanyProfitDetail(
  companyProfit: MoneyValue,
  operands: Pick<HomeDashboardKpiBreakdown, 'recognizedCompanyRevenue'>,
  companyActual: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: companyProfit,
    whatIs: copy.companyProfitWhat,
    formula: copy.companyProfitFormula,
    breakdown: lines(
      { label: copy.labelRecognizedRevenue, money: operands.recognizedCompanyRevenue },
      { label: copy.labelRecognizedCost, money: companyActual },
      { label: title, money: companyProfit },
    ),
    fullScreenHref: '/reports?section=profitability',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildUnallocatedBusinessCostsDetail(
  total: MoneyValue,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: total,
    whatIs: copy.unallocatedBusinessCostsWhat,
    formula: copy.unallocatedBusinessCostsFormula,
    breakdown: [{ label: title, money: total, href: '/expenses?unallocated=true' }],
    fullScreenHref: '/expenses?unallocated=true',
    fullScreenLabel: copy.expensesLink,
  };
}

export function buildForecastProfitDetail(
  profit: MoneyValue,
  contractTotal: MoneyValue | null,
  forecastCost: MoneyValue | null,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: profit,
    whatIs: copy.forecastProfitWhat,
    formula: copy.forecastProfitFormula,
    breakdown: lines(
      { label: copy.labelContracts, money: contractTotal },
      { label: copy.labelForecastCost, money: forecastCost },
      { label: title, money: profit },
    ),
    fullScreenHref: '/reports?section=profitability',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildProfitabilityRateDetail(
  percent: string,
  profit: MoneyValue | null,
  contractTotal: MoneyValue | null,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    valuePercent: percent,
    whatIs: copy.profitabilityRateWhat,
    formula: copy.profitabilityRateFormula,
    breakdown: lines(
      { label: copy.labelProfit, money: profit },
      { label: copy.labelContracts, money: contractTotal },
      { label: copy.labelProfitabilityRate, text: `${percent}%` },
    ),
    fullScreenHref: '/reports?section=profitability',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildInvoicedThisMonthDetail(
  netInvoiced: MoneyValue,
  grossInvoiced: MoneyValue,
  selectedMonth: string,
  title: string,
  copy: DashboardKpiDetailCopy,
  vatLabels?: MonthlyVatLabels,
): DashboardKpiDetailContent {
  return {
    title,
    value: netInvoiced,
    grossValue: vatLabels ? grossInvoiced : undefined,
    grossLabel: vatLabels?.incVat,
    whatIs: copy.invoicedThisMonthWhat,
    formula: copy.invoicedThisMonthFormula,
    breakdown: vatLabels
      ? monthlyVatLines(netInvoiced, grossInvoiced, vatLabels)
      : lines(
          { label: copy.labelBilled, money: netInvoiced },
          { label: `${copy.labelBilled} (${copy.labelOutstanding})`, money: grossInvoiced },
        ),
    fullScreenHref: billingIssuedMonthHref(selectedMonth),
    fullScreenLabel: copy.billingLink,
  };
}

export function buildCollectionsThisMonthDetail(
  netCollections: MoneyValue,
  grossCollections: MoneyValue,
  selectedMonth: string,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  return {
    title,
    value: netCollections,
    whatIs: copy.collectionsThisMonthWhat,
    formula: copy.collectionsThisMonthFormula,
    breakdown: lines(
      { label: copy.labelPaid, money: netCollections },
      { label: `${copy.labelPaid} (${copy.labelOutstanding})`, money: grossCollections },
    ),
    fullScreenHref: billingCollectedMonthHref(selectedMonth),
    fullScreenLabel: copy.billingLink,
  };
}

export function buildCostsThisMonthDetail(
  costsThisMonth: MoneyValue,
  _selectedMonth: string,
  title: string,
  copy: DashboardKpiDetailCopy,
  grossCosts?: MoneyValue,
  vatLabels?: MonthlyVatLabels,
): DashboardKpiDetailContent {
  const gross = grossCosts ?? costsThisMonth;
  return {
    title,
    value: costsThisMonth,
    grossValue: vatLabels ? gross : undefined,
    grossLabel: vatLabels?.incVat,
    whatIs: copy.costsThisMonthWhat,
    formula: copy.costsThisMonthFormula,
    breakdown: vatLabels
      ? monthlyVatLines(costsThisMonth, gross, vatLabels)
      : lines({ label: title, money: costsThisMonth }),
  };
}
