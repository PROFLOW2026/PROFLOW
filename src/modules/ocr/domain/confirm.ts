import { DomainRuleError } from '@/shared/errors';

import type {
  OcrCandidateFieldKey,
  OcrFieldCandidate,
  ReceiptExtractionCandidates,
} from './types';
import { OCR_CANDIDATE_FIELD_KEYS } from './types';

/**
 * Confirmed field values after human review — still not ledger truth until an
 * Expense or Vendor Bill draft write path persists them explicitly.
 */
export interface ConfirmedReceiptFields {
  readonly vendor: string | null;
  readonly companyNumber: string | null;
  readonly vatId: string | null;
  readonly date: string | null;
  readonly dueDate: string | null;
  readonly reference: string | null;
  readonly orderNumber: string | null;
  readonly documentType: string | null;
  readonly description: string | null;
  readonly net: string | null;
  readonly tax: string | null;
  readonly gross: string | null;
  readonly currency: string | null;
}

export interface ConfirmReceiptExtractionInput {
  readonly candidates: ReceiptExtractionCandidates;
  /**
   * Explicit user overrides keyed by field. Missing keys keep the candidate
   * value only when the user also sets `acceptedFields` for that key.
   */
  readonly overrides?: Partial<Record<OcrCandidateFieldKey, string | null>>;
  /** Fields the user explicitly accepted for mapping into a draft form. */
  readonly acceptedFields: readonly OcrCandidateFieldKey[];
}

/**
 * Hard rule: OCR candidates never become Expense/ledger truth without an
 * explicit confirmation of at least one field.
 */
export function assertOcrIsNotCanonicalLedgerTruth(): void {
  // Structural guarantee documented for tests and call sites.
}

export function confirmReceiptExtraction(
  input: ConfirmReceiptExtractionInput,
): ConfirmedReceiptFields {
  assertOcrIsNotCanonicalLedgerTruth();

  if (input.acceptedFields.length === 0) {
    throw new DomainRuleError(
      'Confirm at least one OCR field before mapping into a draft',
      'ocr.errors.confirmationRequired',
    );
  }

  const accepted = new Set(input.acceptedFields);
  for (const key of accepted) {
    if (!OCR_CANDIDATE_FIELD_KEYS.includes(key)) {
      throw new DomainRuleError(`Unknown OCR field: ${key}`, 'ocr.errors.unknownField');
    }
  }

  const pick = (key: OcrCandidateFieldKey, candidate: OcrFieldCandidate): string | null => {
    if (!accepted.has(key)) return null;
    if (input.overrides && Object.prototype.hasOwnProperty.call(input.overrides, key)) {
      const override = input.overrides[key];
      return override === undefined ? null : override;
    }
    return candidate.value;
  };

  return {
    vendor: pick('vendor', input.candidates.vendor),
    companyNumber: pick('companyNumber', input.candidates.companyNumber),
    vatId: pick('vatId', input.candidates.vatId),
    date: pick('date', input.candidates.date),
    dueDate: pick('dueDate', input.candidates.dueDate),
    reference: pick('reference', input.candidates.reference),
    orderNumber: pick('orderNumber', input.candidates.orderNumber),
    documentType: pick('documentType', input.candidates.documentType),
    description: pick('description', input.candidates.description),
    net: pick('net', input.candidates.net),
    tax: pick('tax', input.candidates.tax),
    gross: pick('gross', input.candidates.gross),
    currency: pick('currency', input.candidates.currency),
  };
}

/**
 * Mapping into Expense must be a separate explicit application step.
 * This helper only builds a draft form payload — it does not write the ledger.
 *
 * Project/category suggestions are intentionally omitted (non-canonical).
 */
export function mapConfirmedFieldsToExpenseDraft(fields: ConfirmedReceiptFields): {
  readonly vendorName: string | null;
  readonly expenseDate: string | null;
  readonly dueDate: string | null;
  readonly reference: string | null;
  readonly description: string | null;
  readonly netAmount: string | null;
  readonly taxAmount: string | null;
  readonly grossAmount: string | null;
  readonly currency: string | null;
  readonly projectId: null;
  readonly costCategoryId: null;
  readonly isLedgerTruth: false;
  readonly status: 'draft';
} {
  return {
    vendorName: fields.vendor,
    expenseDate: fields.date,
    dueDate: fields.dueDate,
    reference: fields.reference,
    description: fields.description,
    netAmount: fields.net,
    taxAmount: fields.tax,
    grossAmount: fields.gross,
    currency: fields.currency,
    projectId: null,
    costCategoryId: null,
    isLedgerTruth: false,
    status: 'draft',
  };
}

/**
 * Mapping into a Vendor Bill draft payload — never open/posted recognition.
 * Caller must supply an explicit vendor entity id (OCR vendor text is not an ID).
 */
export function mapConfirmedFieldsToVendorBillDraft(
  fields: ConfirmedReceiptFields,
  vendorId: string,
  structuredLines?: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
  }[],
): {
  readonly vendorId: string;
  readonly vendorNameHint: string | null;
  readonly reference: string | null;
  readonly billDate: string | null;
  readonly dueDate: string | null;
  readonly description: string | null;
  readonly netAmount: string | null;
  readonly taxAmount: string | null;
  readonly totalAmount: string | null;
  readonly currency: string | null;
  readonly projectId: null;
  readonly purchaseOrderId: null;
  readonly status: 'draft';
  readonly isLedgerTruth: false;
  readonly recognizedVendorActual: false;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
  }[];
} {
  const currency = fields.currency?.trim().toUpperCase() || null;
  const totalAmount = fields.gross?.trim() || fields.net?.trim() || null;
  const lineDescription =
    fields.description?.trim() || fields.reference?.trim() || 'Vendor bill (from document review)';

  return {
    vendorId,
    vendorNameHint: fields.vendor,
    reference: fields.reference,
    billDate: fields.date,
    dueDate: fields.dueDate,
    description: fields.description,
    netAmount: fields.net,
    taxAmount: fields.tax,
    totalAmount,
    currency,
    projectId: null,
    purchaseOrderId: null,
    status: 'draft',
    isLedgerTruth: false,
    recognizedVendorActual: false,
    lines:
      structuredLines && structuredLines.length > 0
        ? structuredLines
        : totalAmount && currency
          ? [
              {
                description: lineDescription.slice(0, 500),
                quantity: '1',
                unitAmount: totalAmount,
                lineTotal: totalAmount,
                currency,
              },
            ]
          : [],
  };
}

export function mapStructuredBillLines(
  candidates: ReceiptExtractionCandidates,
  currency: string,
): readonly {
  readonly description: string;
  readonly quantity: string;
  readonly unitAmount: string;
  readonly lineTotal: string;
  readonly currency: string;
}[] {
  return candidates.lines
    .map((line) => {
      const description = line.description.value?.trim();
      const lineTotal = line.lineTotal.value?.trim() || line.netAmount.value?.trim();
      const unitAmount = line.unitPrice.value?.trim() || lineTotal;
      const quantity = line.quantity.value?.trim() || '1';
      if (!description || !lineTotal) return null;
      return {
        description: description.slice(0, 500),
        quantity,
        unitAmount: unitAmount ?? lineTotal,
        lineTotal,
        currency,
      };
    })
    .filter((line): line is NonNullable<typeof line> => line != null);
}
