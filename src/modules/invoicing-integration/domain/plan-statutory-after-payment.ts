import { findBlockingExternalDocument, isBlockingIssuanceOutcome } from './assert-issuance-eligible';
import { buildStatutoryIdempotencyKey } from './idempotency-key';
import { shouldAutoIssueReceiptAfterPayment, type OrgInvoicingSettings } from './org-invoicing-settings';
import type { ExternalDocumentKind, ExternalStatutoryDocument } from './types';

export type PaymentStatutoryKind = Extract<ExternalDocumentKind, 'receipt' | 'tax_invoice_receipt'>;

export type StatutoryAfterPaymentSkipReason =
  | 'receipt_issuance_off'
  | 'tax_invoice_required_first'
  | 'already_issued_for_billing'
  | 'payment_document_already_scoped';

export type StatutoryAfterPaymentPlan =
  | {
      readonly action: 'issue';
      readonly kind: PaymentStatutoryKind;
      readonly idempotencyKey: string;
      readonly linkedTaxInvoiceExternalId: string | null;
    }
  | {
      readonly action: 'skip';
      readonly reason: StatutoryAfterPaymentSkipReason;
    };

export interface PlanStatutoryAfterPaymentInput {
  readonly settings: OrgInvoicingSettings;
  readonly billingDocuments: readonly ExternalStatutoryDocument[];
  readonly paymentDocuments: readonly ExternalStatutoryDocument[];
  readonly paymentId: string;
  readonly billingRecordId: string;
}

/**
 * Decides the statutory document for one payment allocation.
 * Never chooses a second tax invoice. Receipt kinds stay on the existing
 * payment-scoped idempotency key, so a second allocation of the same payment
 * and kind is skipped (one blocking row per payment id).
 */
export function planStatutoryIssuanceAfterPayment(
  input: PlanStatutoryAfterPaymentInput,
): StatutoryAfterPaymentPlan {
  if (!shouldAutoIssueReceiptAfterPayment(input.settings)) {
    return { action: 'skip', reason: 'receipt_issuance_off' };
  }

  const taxInvoice = findBlockingExternalDocument(input.billingDocuments, 'tax_invoice');

  let kind: PaymentStatutoryKind;
  if (input.settings.paymentDocumentPolicy === 'tax_invoice_receipt_on_payment' && !taxInvoice) {
    kind = 'tax_invoice_receipt';
  } else if (taxInvoice) {
    kind = 'receipt';
  } else if (input.settings.paymentDocumentPolicy === 'tax_invoice_then_receipt') {
    return { action: 'skip', reason: 'tax_invoice_required_first' };
  } else {
    kind = 'tax_invoice_receipt';
  }

  const idempotencyKey = buildStatutoryIdempotencyKey(
    input.billingRecordId,
    kind,
    input.paymentId,
  );

  const onThisBilling = input.billingDocuments.filter((doc) => doc.paymentId === input.paymentId);
  if (findBlockingExternalDocument(onThisBilling, kind)) {
    return { action: 'skip', reason: 'already_issued_for_billing' };
  }

  const samePaymentKind = input.paymentDocuments.filter(
    (doc) => doc.paymentId === input.paymentId && doc.kind === kind,
  );
  const heldOnAnotherInvoice = samePaymentKind.some(
    (doc) =>
      doc.billingRecordId !== input.billingRecordId &&
      (isBlockingIssuanceOutcome(doc.issuanceOutcome) || doc.idempotencyKey === idempotencyKey),
  );
  if (heldOnAnotherInvoice) {
    return { action: 'skip', reason: 'payment_document_already_scoped' };
  }

  return {
    action: 'issue',
    kind,
    idempotencyKey,
    linkedTaxInvoiceExternalId: taxInvoice?.externalId ?? null,
  };
}
