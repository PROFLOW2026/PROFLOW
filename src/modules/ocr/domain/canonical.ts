/**
 * Canonical OCR document result — provider-agnostic.
 * Adapters map vendor JSON into this shape; application code never reads
 * Azure/Google/AWS field names.
 */

import type {
  OcrDocumentTypeKey,
  OcrDraftTarget,
  OcrFieldCandidate,
  OcrLineItemCandidate,
  OcrSafeRawMetadata,
  OcrWorkflowContext,
  ReceiptExtractionCandidates,
} from './types';
import { emptyCandidates } from './field-mapping';

export interface CanonicalOcrSupplier {
  readonly name: OcrFieldCandidate;
  readonly companyNumber: OcrFieldCandidate;
  readonly vatId: OcrFieldCandidate;
  readonly address: OcrFieldCandidate;
  readonly phone: OcrFieldCandidate;
  readonly email: OcrFieldCandidate;
}

export interface CanonicalOcrIdentity {
  readonly documentNumber: OcrFieldCandidate;
  readonly issueDate: OcrFieldCandidate;
  readonly dueDate: OcrFieldCandidate;
  readonly orderNumber: OcrFieldCandidate;
}

export interface CanonicalOcrMoney {
  readonly currency: OcrFieldCandidate;
  /** Subtotal before document-level discount. */
  readonly subtotal: OcrFieldCandidate;
  /** Document-level discount amount. */
  readonly discount: OcrFieldCandidate;
  /** Taxable amount before VAT (after discounts). */
  readonly net: OcrFieldCandidate;
  readonly tax: OcrFieldCandidate;
  /** VAT rate percent string when known (e.g. "18"). */
  readonly vatRate: OcrFieldCandidate;
  /** Invoice total including VAT — never copied from subtotal. */
  readonly gross: OcrFieldCandidate;
  readonly amountDue: OcrFieldCandidate;
  readonly vatRates: readonly string[];
}

export interface CanonicalOcrDocument {
  readonly documentTypeKey: OcrDocumentTypeKey;
  readonly documentTypeLabel: OcrFieldCandidate;
  readonly supplier: CanonicalOcrSupplier;
  readonly identity: CanonicalOcrIdentity;
  readonly money: CanonicalOcrMoney;
  readonly lines: readonly OcrLineItemCandidate[];
  readonly description: OcrFieldCandidate;
  readonly languages: readonly string[];
  readonly pageCount: number | null;
  readonly overallConfidence: number | null;
  readonly metadata: OcrSafeRawMetadata;
}

export function suggestedDraftTarget(
  workflow: OcrWorkflowContext,
  documentTypeKey: OcrDocumentTypeKey,
): OcrDraftTarget {
  if (workflow === 'expense') return 'expense';
  if (workflow === 'vendor_bill') return 'vendor_bill';
  if (workflow === 'vendor_credit') return 'vendor_credit';
  if (documentTypeKey === 'credit_note') return 'vendor_credit';
  if (documentTypeKey === 'receipt') return 'expense';
  if (
    documentTypeKey === 'tax_invoice' ||
    documentTypeKey === 'vendor_invoice' ||
    documentTypeKey === 'transaction_invoice' ||
    documentTypeKey === 'tax_invoice_receipt'
  ) {
    return 'vendor_bill';
  }
  return 'expense';
}

export function canonicalToCandidates(
  document: CanonicalOcrDocument,
): ReceiptExtractionCandidates {
  const base = emptyCandidates(document.supplier.name.provenance);
  const lineDescriptions = document.lines
    .map((line) => line.description)
    .filter((field) => Boolean(field.value?.trim()));

  return {
    ...base,
    vendor: document.supplier.name,
    companyNumber: document.supplier.companyNumber,
    vatId: document.supplier.vatId,
    date: document.identity.issueDate,
    dueDate: document.identity.dueDate,
    reference: document.identity.documentNumber,
    orderNumber: document.identity.orderNumber,
    documentType: document.documentTypeLabel,
    description: document.description,
    subtotal: document.money.subtotal,
    discount: document.money.discount,
    net: document.money.net,
    tax: document.money.tax,
    vatRate: document.money.vatRate,
    gross: document.money.gross,
    amountDue: document.money.amountDue,
    currency: document.money.currency,
    lineDescriptions,
    lines: document.lines,
    suggestions: base.suggestions,
  };
}
