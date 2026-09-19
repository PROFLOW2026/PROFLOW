import type { OrgCommercialTotals } from './aggregate-org-report';
import { computeUnbilledBacklog } from './management-analytics';
import { addMoney, compareMoney, subtractMoney, zeroMoney, type MoneyValue } from '@/shared/money';

export interface OrgContractSummary {
  readonly originalContractTotal: MoneyValue;
  readonly approvedChangesTotal: MoneyValue;
  readonly totalIncludingApproved: MoneyValue;
  readonly remainingContract: MoneyValue | null;
  /** original + approvedChanges − totalIncludingApproved (expect 0.00). */
  readonly reconciliationDifference: MoneyValue;
}

/**
 * Organization contract cards for the dashboard.
 * Pending changes are excluded — only original + approved net delta → current total.
 */
export function buildOrgContractSummary(
  commercial: OrgCommercialTotals | null,
  netInvoiced: MoneyValue | null,
): OrgContractSummary | null {
  if (!commercial) return null;

  const originalContractTotal = commercial.original.value;
  const totalIncludingApproved = commercial.current.value;
  const approvedChangesTotal = subtractMoney(totalIncludingApproved, originalContractTotal);
  const remainingContract = computeUnbilledBacklog(totalIncludingApproved, netInvoiced);
  const recomposedTotal = addMoney(originalContractTotal, approvedChangesTotal);
  const reconciliationDifference = subtractMoney(recomposedTotal, totalIncludingApproved);

  return {
    originalContractTotal,
    approvedChangesTotal,
    totalIncludingApproved,
    remainingContract,
    reconciliationDifference,
  };
}

export function isContractSummaryReconciled(summary: OrgContractSummary): boolean {
  return (
    compareMoney(
      summary.reconciliationDifference,
      zeroMoney(summary.originalContractTotal.currency),
    ) === 0
  );
}
