import type { OcrReviewWarning, ReceiptExtractionCandidates } from './types';
import { moneyNearlyEqual, parseMoneyToken } from './israeli-normalize';

export function collectReviewWarnings(
  candidates: ReceiptExtractionCandidates,
  options: {
    vendorResolved: boolean;
    draftTarget: string;
    organizationTaxId?: string | null;
    customerTaxId?: string | null;
  },
): OcrReviewWarning[] {
  const warnings: OcrReviewWarning[] = [];
  const subtotal = parseMoneyToken(candidates.subtotal.value);
  const discount = parseMoneyToken(candidates.discount.value);
  const net = parseMoneyToken(candidates.net.value);
  const tax = parseMoneyToken(candidates.tax.value);
  const gross = parseMoneyToken(candidates.gross.value);
  const amountDue = parseMoneyToken(candidates.amountDue.value);
  const vatRate = parseMoneyToken(candidates.vatRate.value);

  if (!candidates.gross.value?.trim()) {
    warnings.push({ code: 'gross_missing', messageKey: 'warnGrossMissing' });
  }

  if (net != null && tax != null && gross != null && !moneyNearlyEqual(net + tax, gross)) {
    warnings.push({ code: 'totals_mismatch', messageKey: 'warnTotalsMismatch' });
  }

  if (
    subtotal != null &&
    discount != null &&
    net != null &&
    !moneyNearlyEqual(subtotal - discount, net)
  ) {
    warnings.push({ code: 'discount_mismatch', messageKey: 'warnDiscountMismatch' });
  }

  if (net != null && vatRate != null && tax != null) {
    const expectedTax = (net * vatRate) / 100;
    if (!moneyNearlyEqual(expectedTax, tax, 0.05)) {
      warnings.push({ code: 'vat_rate_mismatch', messageKey: 'warnVatRateMismatch' });
    }
  }

  if (
    amountDue != null &&
    gross != null &&
    !moneyNearlyEqual(amountDue, gross) &&
    candidates.amountDue.value !== candidates.gross.value
  ) {
    warnings.push({ code: 'amount_due_mismatch', messageKey: 'warnAmountDueMismatch' });
  }

  const lineSum = candidates.lines.reduce((sum, line) => {
    // Reconcile pre-VAT line amounts against document net — never gross/lineTotal.
    const amount = parseMoneyToken(line.netAmount.value);
    return amount == null ? sum : sum + amount;
  }, 0);
  const reconcileTarget =
    net ??
    (subtotal != null && discount != null
      ? subtotal - discount
      : subtotal);
  if (
    candidates.lines.length > 0 &&
    reconcileTarget != null &&
    lineSum > 0 &&
    !moneyNearlyEqual(lineSum, reconcileTarget, 0.05)
  ) {
    warnings.push({ code: 'line_sum_mismatch', messageKey: 'warnLineSumMismatch' });
  }

  const currency = candidates.currency.value?.trim().toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    warnings.push({ code: 'currency_invalid', messageKey: 'warnCurrency' });
  }

  const date = candidates.date.value?.trim();
  const due = candidates.dueDate.value?.trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    warnings.push({ code: 'date_invalid', messageKey: 'warnDateInvalid' });
  }
  if (due && date && due < date) {
    warnings.push({ code: 'due_before_issue', messageKey: 'warnDueBeforeIssue' });
  }

  if (!candidates.reference.value?.trim()) {
    warnings.push({ code: 'reference_missing', messageKey: 'warnReferenceMissing' });
  }
  if (!candidates.vendor.value?.trim()) {
    warnings.push({ code: 'supplier_missing', messageKey: 'warnSupplierMissing' });
  }
  if (!candidates.companyNumber.value?.trim()) {
    warnings.push({ code: 'supplier_id_missing', messageKey: 'warnSupplierIdMissing' });
  }
  if (options.draftTarget !== 'expense' && !options.vendorResolved) {
    warnings.push({ code: 'vendor_unresolved', messageKey: 'warnVendorUnresolved' });
  }

  const customerTaxId = options.customerTaxId?.replace(/[^\d]/g, '') || null;
  const orgTaxId = options.organizationTaxId?.replace(/[^\d]/g, '') || null;
  // Only when both identities are known and disagree — never auto-reject.
  if (customerTaxId && orgTaxId && customerTaxId !== orgTaxId) {
    warnings.push({ code: 'possible_wrong_customer', messageKey: 'warnPossibleWrongCustomer' });
  }

  return warnings;
}

export function lineItemsTrustworthy(
  candidates: ReceiptExtractionCandidates,
): boolean {
  const substantive = candidates.lines.filter(isSubstantiveLine);
  if (substantive.length === 0) return false;
  const described = substantive.filter((line) => line.description.value?.trim());
  if (described.length !== substantive.length) return false;
  const incomplete = substantive.some(
    (line) => !line.netAmount.value?.trim() || parseMoneyToken(line.netAmount.value) == null,
  );
  if (incomplete) return false;

  const net = parseMoneyToken(candidates.net.value);
  const subtotal = parseMoneyToken(candidates.subtotal.value);
  const discount = parseMoneyToken(candidates.discount.value);
  const reconcileTarget =
    net ??
    (subtotal != null && discount != null ? subtotal - discount : subtotal);
  if (reconcileTarget == null) return false;

  const lineSum = substantive.reduce((sum, line) => {
    const amount = parseMoneyToken(line.netAmount.value);
    return amount == null ? sum : sum + amount;
  }, 0);
  return lineSum > 0 && moneyNearlyEqual(lineSum, reconcileTarget, 0.05);
}

/** Empty Azure phantom rows are ignored for AP trust decisions. */
export function isSubstantiveLine(line: ReceiptExtractionCandidates['lines'][number]): boolean {
  return Boolean(
    line.description.value?.trim() ||
      line.netAmount.value?.trim() ||
      line.quantity.value?.trim() ||
      line.unitPrice.value?.trim(),
  );
}

export function countTrustworthyLineRows(candidates: ReceiptExtractionCandidates): {
  detected: number;
  substantive: number;
  trustworthy: boolean;
} {
  const substantive = candidates.lines.filter(isSubstantiveLine).length;
  return {
    detected: candidates.lines.length,
    substantive,
    trustworthy: lineItemsTrustworthy(candidates),
  };
}
