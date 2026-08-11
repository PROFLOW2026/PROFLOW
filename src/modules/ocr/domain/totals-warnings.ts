import type { OcrReviewWarning, ReceiptExtractionCandidates } from './types';

function parseMoney(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
}

function nearlyEqual(a: number, b: number, epsilon = 0.02): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function collectReviewWarnings(
  candidates: ReceiptExtractionCandidates,
  options: { vendorResolved: boolean; draftTarget: string },
): OcrReviewWarning[] {
  const warnings: OcrReviewWarning[] = [];
  const net = parseMoney(candidates.net.value);
  const tax = parseMoney(candidates.tax.value);
  const gross = parseMoney(candidates.gross.value);

  if (net != null && tax != null && gross != null && !nearlyEqual(net + tax, gross)) {
    warnings.push({ code: 'totals_mismatch', messageKey: 'warnTotalsMismatch' });
  }

  const lineSum = candidates.lines.reduce((sum, line) => {
    const amount = parseMoney(line.lineTotal.value) ?? parseMoney(line.netAmount.value);
    return amount == null ? sum : sum + amount;
  }, 0);
  if (candidates.lines.length > 0 && gross != null && lineSum > 0 && !nearlyEqual(lineSum, gross, 0.05)) {
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
  if (options.draftTarget !== 'expense' && !options.vendorResolved) {
    warnings.push({ code: 'vendor_unresolved', messageKey: 'warnVendorUnresolved' });
  }

  return warnings;
}

export function lineItemsTrustworthy(
  candidates: ReceiptExtractionCandidates,
): boolean {
  if (candidates.lines.length === 0) return false;
  const described = candidates.lines.filter((line) => line.description.value?.trim());
  return described.length === candidates.lines.length;
}
