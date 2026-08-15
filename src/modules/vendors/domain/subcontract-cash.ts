/**
 * Paid / outstanding from existing vendor bills tagged to one subcontract agreement.
 * Commitment ≠ expense. Cash ≠ Actual. This module never posts AP.
 *
 * Payable statuses mirror AP recognized bills (open / partially_matched / matched).
 */

import { addMoney, compareMoney, money, subtractMoney, zeroMoney, type MoneyValue } from '@/shared/money';
import type { SubcontractApBillCashRow, SubcontractCashPosition } from './subcontract-types';

function isPayableBillStatus(status: string): boolean {
  return status === 'open' || status === 'partially_matched' || status === 'matched';
}

export const SUBCONTRACT_CASH_NOTE =
  'Paid and outstanding read existing vendor bills tagged to this subcontract agreement. Creating or changing a subcontract never posts a vendor bill.';

export function computeSubcontractCashPosition(
  bills: readonly SubcontractApBillCashRow[],
  currency: string,
): SubcontractCashPosition {
  const code = currency.toUpperCase();
  let billed = zeroMoney(code);
  let paid = zeroMoney(code);

  for (const bill of bills) {
    if (bill.currency.toUpperCase() !== code) continue;
    if (!isPayableBillStatus(bill.status)) continue;
    billed = addMoney(billed, money(bill.totalAmount, code));
    paid = addMoney(paid, money(bill.paidAmount, code));
  }

  let outstanding: MoneyValue = subtractMoney(billed, paid);
  if (compareMoney(outstanding, zeroMoney(code)) < 0) {
    outstanding = zeroMoney(code);
  }

  return {
    billed: billed.amount,
    paid: paid.amount,
    outstanding: outstanding.amount,
    currency: code,
    note: SUBCONTRACT_CASH_NOTE,
  };
}
