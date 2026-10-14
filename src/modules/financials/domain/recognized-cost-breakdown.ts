import { yearMonthFromBusinessDate } from '@/modules/month-close';
import type { ExpensePaymentRecognitionFields } from '@/modules/expenses/domain/installment-payment-recognition';
import {
  recognizedExpenseGrossInYearMonth,
  recognizedExpenseNetInYearMonth,
} from '@/modules/expenses/domain/installment-payment-recognition';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  addMoney,
  compareMoney,
  isZeroMoney,
  minMoney,
  money,
  roundMoney,
  subtractMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

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

/** Sum recognized expense NET across inclusive YYYY-MM range (monthly engine scope). */
export function sumExpenseRecognizedNetInYearMonthRange(
  fields: ExpensePaymentRecognitionFields,
  fromYm: string,
  toYm: string,
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (let y = Number(fromYm.slice(0, 4)), m = Number(fromYm.slice(5, 7)); ; ) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const slice = recognizedExpenseNetInYearMonth(fields, ym);
    if (slice) total = addMoney(total, slice);
    if (ym === toYm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return total;
}

/**
 * Reduce an expense slice when accepted AP matches cover part of the expense (F03 / F02).
 * Scales NET and GROSS proportionally within the query date range.
 */
export function scaleExpenseRecognitionSliceForApDeduction(input: {
  readonly currency: string;
  readonly rawNet: MoneyValue | null;
  readonly rawGross: MoneyValue | null;
  readonly totalRecognizedNetInScope: MoneyValue;
  readonly matchedDeductionNet: string | undefined;
}): { readonly net: MoneyValue | null; readonly gross: MoneyValue | null } {
  const { currency, rawNet, rawGross, totalRecognizedNetInScope, matchedDeductionNet } = input;
  if (!rawNet || isZeroMoney(rawNet)) {
    return { net: rawNet, gross: rawGross };
  }
  if (!matchedDeductionNet) {
    return { net: rawNet, gross: rawGross ?? rawNet };
  }
  if (compareMoney(totalRecognizedNetInScope, zeroMoney(currency)) <= 0) {
    return { net: null, gross: null };
  }
  const deduct = minMoney(money(matchedDeductionNet, currency), totalRecognizedNetInScope);
  const remaining = subtractMoney(totalRecognizedNetInScope, deduct);
  if (compareMoney(remaining, zeroMoney(currency)) <= 0) {
    return { net: null, gross: null };
  }
  const ratio = Number(remaining.amount) / Number(totalRecognizedNetInScope.amount);
  const net = roundMoney(money(String(Number(rawNet.amount) * ratio), currency));
  const grossBase = rawGross ?? rawNet;
  const gross = roundMoney(money(String(Number(grossBase.amount) * ratio), currency));
  return { net, gross };
}

export function sumExpenseRecognizedGrossInYearMonthRange(
  fields: ExpensePaymentRecognitionFields,
  fromYm: string,
  toYm: string,
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (let y = Number(fromYm.slice(0, 4)), m = Number(fromYm.slice(5, 7)); ; ) {
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    const slice = recognizedExpenseGrossInYearMonth(fields, ym);
    if (slice) total = addMoney(total, slice);
    if (ym === toYm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return total;
}
