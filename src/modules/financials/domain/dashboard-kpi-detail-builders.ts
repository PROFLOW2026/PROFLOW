import type { OrgContractSummary } from './dashboard-contract-summary';
import type { DashboardKpiDetailContent, DashboardKpiDetailLine } from './dashboard-kpi-detail';
import type { BusinessCashPosition, BusinessCashSourceKey } from './business-cash-position';
import { subtractMoney, type MoneyValue } from '@/shared/money';

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
}

function lines(...items: DashboardKpiDetailLine[]): DashboardKpiDetailLine[] {
  return items;
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
    breakdown: lines({ label: title, money: apOutstanding }),
    fullScreenHref: '/procurement/ap?status=open',
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
): DashboardKpiDetailContent {
  return {
    title,
    value: actualCost,
    whatIs: copy.actualCostWhat,
    formula: copy.actualCostFormula,
    breakdown: lines({ label: title, money: actualCost }),
    fullScreenHref: '/reports?section=cost',
    fullScreenLabel: copy.reportsLink,
  };
}

export function buildForecastCostDetail(
  forecastCost: MoneyValue,
  actualCost: MoneyValue | null,
  title: string,
  copy: DashboardKpiDetailCopy,
): DashboardKpiDetailContent {
  const remaining =
    actualCost != null
      ? subtractMoney(forecastCost, actualCost)
      : null;
  return {
    title,
    value: forecastCost,
    whatIs: copy.forecastCostWhat,
    formula: copy.forecastCostFormula,
    breakdown: lines(
      { label: copy.labelRecognizedCost, money: actualCost },
      { label: copy.commitmentsWhat, money: remaining },
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
    items.push({ label: copy[labelKey], money });
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
    fullScreenHref: '/expenses',
    fullScreenLabel: copy.expensesLink,
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
    fullScreenHref: '/procurement/ap?status=open',
    fullScreenLabel: copy.apLink,
  };
}
