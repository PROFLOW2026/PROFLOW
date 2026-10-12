import { yearMonthFromBusinessDate } from '@/modules/month-close';
import type { ExpensePaymentRecognitionFields } from '@/modules/expenses/domain/installment-payment-recognition';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { subtractMoney, zeroMoney, type MoneyValue } from '@/shared/money';

/** Display-only: which calendar date to show for a recognized slice in `yearMonth`. */
export function recognitionDateForExpenseInYearMonth(
  fields: ExpensePaymentRecognitionFields,
  yearMonth: string,
): BusinessDate | null {
  const verified = fields.verifiedInstallmentPayments ?? [];
  for (const payment of verified) {
    if (payment.verification !== 'verified' || !payment.actualPaidAt) continue;
    if (yearMonthFromBusinessDate(payment.actualPaidAt) !== yearMonth) continue;
    return payment.actualPaidAt;
  }
  const count = fields.installmentCount;
  if (!Number.isInteger(count) || count <= 1) {
    if (fields.paidAt) {
      const paidYm = yearMonthFromBusinessDate(businessDate(fields.paidAt));
      if (paidYm === yearMonth) return businessDate(fields.paidAt);
    }
    const purchaseYm = yearMonthFromBusinessDate(businessDate(fields.expenseDate));
    if (purchaseYm === yearMonth) return businessDate(fields.expenseDate);
    return null;
  }
  if (fields.paidAt) {
    const paidYm = yearMonthFromBusinessDate(businessDate(fields.paidAt));
    if (paidYm === yearMonth) return businessDate(fields.paidAt);
  }
  return `${yearMonth}-01` as BusinessDate;
}

export function vatFromNetGross(net: MoneyValue, gross: MoneyValue): MoneyValue {
  return subtractMoney(gross, net);
}

export function zeroVat(currency: string): MoneyValue {
  return zeroMoney(currency);
}
