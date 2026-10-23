import { isMaterialPositiveMoney, negateMoney, type MoneyValue } from '@/shared/money';
import type { BillingAmountInput } from '@/modules/billing/domain/outstanding';
import {
  computeRecordRevenuePosition,
  type PaymentAmountInput,
} from '@/modules/billing/domain/revenue-position';

export interface OpenCustomerBillSource extends BillingAmountInput {
  readonly id: string;
  readonly projectId: string | null;
  readonly reference: string | null;
  readonly customerName: string | null;
  readonly payments: readonly PaymentAmountInput[];
  readonly retentionHeldRemaining?: MoneyValue;
}

export interface OpenCustomerBill {
  readonly id: string;
  readonly projectId: string | null;
  readonly clientName: string | null;
  readonly reference: string | null;
  readonly billedNet: MoneyValue;
  readonly billedGross: MoneyValue;
  readonly collectedNet: MoneyValue;
  readonly collectedGross: MoneyValue;
  readonly balanceNet: MoneyValue;
  readonly balanceGross: MoneyValue;
}

/** Final bills that still have a balance. Drafts, voids, and fully paid bills are omitted. */
export function listOpenCustomerBills(
  records: readonly OpenCustomerBillSource[],
  currency: string,
): OpenCustomerBill[] {
  const bills: OpenCustomerBill[] = [];
  for (const record of records) {
    if (record.totalAmount.currency !== currency) continue;
    const position = computeRecordRevenuePosition(record, currency);
    if (!position) continue;
    if (!materialBalance(position.open.net) && !materialBalance(position.open.gross)) {
      continue;
    }
    bills.push({
      id: record.id,
      projectId: record.projectId,
      clientName: record.customerName,
      reference: record.reference,
      billedNet: position.billed.net,
      billedGross: position.billed.gross,
      collectedNet: position.paid.net,
      collectedGross: position.paid.gross,
      balanceNet: position.open.net,
      balanceGross: position.open.gross,
    });
  }
  return bills;
}

function materialBalance(value: MoneyValue): boolean {
  return isMaterialPositiveMoney(value) || isMaterialPositiveMoney(negateMoney(value));
}
