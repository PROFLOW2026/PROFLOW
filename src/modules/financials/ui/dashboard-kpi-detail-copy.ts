import type { getTranslations } from 'next-intl/server';
import type { DashboardKpiDetailCopy } from '../domain/dashboard-kpi-detail-builders';
import type { DashboardKpiDetailTriggerCopy } from './dashboard-kpi-detail-trigger';

type DashboardTranslator = Awaited<ReturnType<typeof getTranslations<'dashboard'>>>;

export function mapDashboardKpiDetailCopy(t: DashboardTranslator): DashboardKpiDetailCopy {
  return {
    contractOriginalWhat: t('kpiDetail.contractOriginalWhat'),
    contractOriginalFormula: t('kpiDetail.contractOriginalFormula'),
    contractApprovedWhat: t('kpiDetail.contractApprovedWhat'),
    contractApprovedFormula: t('kpiDetail.contractApprovedFormula'),
    contractTotalWhat: t('kpiDetail.contractTotalWhat'),
    contractTotalFormula: t('kpiDetail.contractTotalFormula'),
    contractRemainingWhat: t('kpiDetail.contractRemainingWhat'),
    contractRemainingFormula: t('kpiDetail.contractRemainingFormula'),
    billedWhat: t('kpiDetail.billedWhat'),
    billedFormula: t('kpiDetail.billedFormula'),
    paidWhat: t('kpiDetail.paidWhat'),
    paidFormula: t('kpiDetail.paidFormula'),
    outstandingWhat: t('kpiDetail.outstandingWhat'),
    outstandingFormula: t('kpiDetail.outstandingFormula'),
    apWhat: t('kpiDetail.apWhat'),
    apFormula: t('kpiDetail.apFormula'),
    actualCostWhat: t('kpiDetail.actualCostWhat'),
    actualCostFormula: t('kpiDetail.actualCostFormula'),
    currentProfitWhat: t('kpiDetail.currentProfitWhat'),
    currentProfitFormula: t('kpiDetail.currentProfitFormula'),
    forecastCostWhat: t('kpiDetail.forecastCostWhat'),
    forecastCostFormula: t('kpiDetail.forecastCostFormula'),
    commitmentsWhat: t('kpiDetail.commitmentsWhat'),
    commitmentsFormula: t('kpiDetail.commitmentsFormula'),
    labelOriginal: t('kpiDetail.labelOriginal'),
    labelApproved: t('kpiDetail.labelApproved'),
    labelTotal: t('kpiDetail.labelTotal'),
    labelNetBilled: t('kpiDetail.labelNetBilled'),
    labelBilled: t('kpiDetail.labelBilled'),
    labelPaid: t('kpiDetail.labelPaid'),
    labelOutstanding: t('kpiDetail.labelOutstanding'),
    labelContracts: t('kpiDetail.labelContracts'),
    labelRecognizedCost: t('kpiDetail.labelRecognizedCost'),
    reportsLink: t('kpiDetail.reportsLink'),
    billingLink: t('kpiDetail.billingLink'),
    apLink: t('kpiDetail.apLink'),
    businessCashPaidWhat: t('kpiDetail.businessCashPaidWhat'),
    businessCashPaidFormula: t('kpiDetail.businessCashPaidFormula'),
    businessCashOutstandingWhat: t('kpiDetail.businessCashOutstandingWhat'),
    businessCashOutstandingFormula: t('kpiDetail.businessCashOutstandingFormula'),
    labelExpenseSuppliers: t('kpiDetail.labelExpenseSuppliers'),
    labelExpenseSubcontractors: t('kpiDetail.labelExpenseSubcontractors'),
    labelApPayments: t('kpiDetail.labelApPayments'),
    labelPayrollPayments: t('kpiDetail.labelPayrollPayments'),
    labelSubcontractAdvances: t('kpiDetail.labelSubcontractAdvances'),
    expensesLink: t('kpiDetail.expensesLink'),
  };
}

export function mapDashboardKpiDetailTriggerCopy(
  t: DashboardTranslator,
): DashboardKpiDetailTriggerCopy {
  return {
    button: t('kpiDetail.button'),
    whatIs: t('kpiDetail.whatIs'),
    formula: t('kpiDetail.formula'),
    breakdown: t('kpiDetail.breakdown'),
    fullScreen: t('kpiDetail.fullScreen'),
  };
}
