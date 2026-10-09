import { findBlockingExternalDocument } from './assert-issuance-eligible';
import { buildStatutoryIdempotencyKey } from './idempotency-key';
import { shouldAutoIssueReceiptAfterPayment, type OrgInvoicingSettings } from './org-invoicing-settings';
import type { ExternalDocumentKind, ExternalStatutoryDocument } from './types';

export type PaymentStatutoryKind = Extract<ExternalDocumentKind, 'receipt' | 'tax_invoice_receipt'>;

export type StatutoryAfterPaymentSkipReason =
  | 'receipt_issuance_off'
  | 'tax_invoice_required_first'
  | 'already_issued_for_billing'

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
 * payment-and-billing-scoped idempotency key, so split allocations across
 * invoices each get their own receipt while the same invoice is not issued twice.
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

  return {
    action: 'issue',
    kind,
    idempotencyKey,
    linkedTaxInvoiceExternalId: taxInvoice?.externalId ?? null,
  };
}
