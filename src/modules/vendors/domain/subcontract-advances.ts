/**
 * Subcontract advance cash. Advance ≠ Actual.
 *
 * Paid advances appear in Cash Paid and Advance Outstanding.
 * They never enter Recognized Actual.
 */

import {
  addMoney,
  compareMoney,
  money,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export const SUBCONTRACT_ADVANCE_STATUSES = [
  'recorded',
  'paid',
  'partially_applied',
  'fully_applied',
  'partially_refunded',
  'fully_refunded',
  'voided',
] as const;
export type SubcontractAdvanceStatus = (typeof SUBCONTRACT_ADVANCE_STATUSES)[number];

export interface SubcontractAdvanceRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly subcontractAgreementId: string;
  readonly projectId: string;
  readonly amount: string;
  readonly currency: string;
  readonly paidDate: string | null;
  readonly status: SubcontractAdvanceStatus;
  /** Derived cache: net applied from subcontract_advance_applications */
  readonly appliedAmount: string;
  /** Derived cache: net refunded from subcontract_advance_refunds */
  readonly refundedAmount: string;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly archivedAt: Date | null;
}

export interface SubcontractAdvancePosition {
  readonly paid: string;
  readonly applied: string;
  readonly outstanding: string;
  readonly currency: string;
}

export interface CreateSubcontractAdvanceInput {
  readonly subcontractAgreementId: string;
  readonly amount: string;
  readonly paidDate?: string | null;
  readonly status?: SubcontractAdvanceStatus;
  readonly notes?: string | null;
}

/**
 * Cash-paid statuses: advance was disbursed and has not been fully returned.
 * - fully_refunded: excluded — cash was fully returned to the business.
 * - recorded / voided: excluded — cash was never disbursed.
 */
function isCashAdvanceStatus(status: SubcontractAdvanceStatus): boolean {
  return (
    status === 'paid' ||
    status === 'partially_applied' ||
    status === 'fully_applied' ||
    status === 'partially_refunded'
  );
}

/**
 * Outstanding = sum(paid) − sum(applied) − sum(refunded).
 * Only statuses in isCashAdvanceStatus() contribute to Cash Paid.
 */
export function computeAdvanceOutstandingBalance(
  advances: readonly SubcontractAdvanceRecord[],
  currency: string,
): SubcontractAdvancePosition {
  const code = currency.toUpperCase();
  let paid = zeroMoney(code);
  let applied = zeroMoney(code);
  let refunded = zeroMoney(code);

  for (const advance of advances) {
    if (advance.archivedAt) continue;
    if (advance.currency.toUpperCase() !== code) continue;
    if (!isCashAdvanceStatus(advance.status)) continue;
    paid = addMoney(paid, money(advance.amount, code));
    applied = addMoney(applied, money(advance.appliedAmount, code));
    refunded = addMoney(refunded, money(advance.refundedAmount, code));
  }

  let outstanding: MoneyValue = subtractMoney(subtractMoney(paid, applied), refunded);
  if (compareMoney(outstanding, zeroMoney(code)) < 0) {
    outstanding = zeroMoney(code);
  }

  return {
    paid: paid.amount,
    applied: applied.amount,
    outstanding: outstanding.amount,
    currency: code,
  };
}

/** Cash Paid includes paid advances. Recognized Actual is unchanged. */
export function foldAdvanceCashIntoPaid(
  apPaid: MoneyValue,
  advancePaid: MoneyValue,
): MoneyValue {
  if (apPaid.currency.toUpperCase() !== advancePaid.currency.toUpperCase()) {
    return apPaid;
  }
  return addMoney(apPaid, advancePaid);
}
