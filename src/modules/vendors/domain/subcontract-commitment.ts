/**
 * Subcontract remaining commitment for Forecast Final Cost.
 *
 * Remaining = current agreement value − recognized AP Actual (per agreement),
 * net of open PO committed on the same vendor+project (avoid double-counting PO).
 */

import {
  addMoney,
  compareMoney,
  isPositiveMoney,
  money,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export interface SubcontractAgreementCommitmentInput {
  readonly agreementId: string;
  readonly vendorId: string;
  readonly currency: string;
  readonly currentAmount: string;
  readonly recognizedActualAmount: string;
}

export interface OpenPoCommittedByVendor {
  readonly vendorId: string;
  readonly amount: MoneyValue;
}

/** Per-agreement remaining before PO overlap netting. */
export function computeSubcontractAgreementRemaining(input: {
  readonly currency: string;
  readonly currentAmount: string;
  readonly recognizedActualAmount: string;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const current = money(input.currentAmount, currency);
  const recognized = money(input.recognizedActualAmount, currency);
  if (compareMoney(recognized, current) >= 0) {
    return zeroMoney(currency);
  }
  return subtractMoney(current, recognized);
}

/**
 * Net subcontract remaining for one vendor after subtracting open PO commitment once.
 * Multiple agreements on the same vendor share one PO bucket.
 */
export function computeVendorSubcontractRemainingNet(input: {
  readonly currency: string;
  readonly agreements: readonly SubcontractAgreementCommitmentInput[];
  readonly openPoCommittedAmount: string;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  let rawRemaining = zeroMoney(currency);
  for (const agreement of input.agreements) {
    if (agreement.currency.toUpperCase() !== currency) continue;
    const slice = computeSubcontractAgreementRemaining({
      currency,
      currentAmount: agreement.currentAmount,
      recognizedActualAmount: agreement.recognizedActualAmount,
    });
    if (isPositiveMoney(slice)) {
      rawRemaining = addMoney(rawRemaining, slice);
    }
  }
  const poOpen = money(input.openPoCommittedAmount, currency);
  if (!isPositiveMoney(rawRemaining) || !isPositiveMoney(poOpen)) {
    return rawRemaining;
  }
  if (compareMoney(poOpen, rawRemaining) >= 0) {
    return zeroMoney(currency);
  }
  return subtractMoney(rawRemaining, poOpen);
}

/**
 * Sum incremental subcontract commitment to fold into engine `committedOpen`
 * (PO open committed is added separately).
 */
export function sumSubcontractRemainingCommitment(input: {
  readonly currency: string;
  readonly agreements: readonly SubcontractAgreementCommitmentInput[];
  readonly openPoByVendor: readonly OpenPoCommittedByVendor[];
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  const poByVendor = new Map<string, MoneyValue>();
  for (const row of input.openPoByVendor) {
    if (row.amount.currency.toUpperCase() !== currency) continue;
    const current = poByVendor.get(row.vendorId) ?? zeroMoney(currency);
    poByVendor.set(row.vendorId, addMoney(current, row.amount));
  }

  const byVendor = new Map<string, SubcontractAgreementCommitmentInput[]>();
  for (const agreement of input.agreements) {
    if (agreement.currency.toUpperCase() !== currency) continue;
    const list = byVendor.get(agreement.vendorId) ?? [];
    list.push(agreement);
    byVendor.set(agreement.vendorId, list);
  }

  const values: MoneyValue[] = [];
  for (const [vendorId, vendorAgreements] of byVendor) {
    const poOpen = poByVendor.get(vendorId) ?? zeroMoney(currency);
    values.push(
      computeVendorSubcontractRemainingNet({
        currency,
        agreements: vendorAgreements,
        openPoCommittedAmount: poOpen.amount,
      }),
    );
  }

  if (values.length === 0) return zeroMoney(currency);
  return sumMoney(values, currency);
}
