import 'server-only';

import { getBillingRecord } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { findBlockingExternalDocument } from '../domain/assert-issuance-eligible';
import type { ExternalDocumentKind } from '../domain/types';
import { getOrgInvoicingSettings } from '../data/org-invoicing-settings.repository';
import { shouldAutoIssueReceiptAfterPayment } from '../domain/org-invoicing-settings';
import { listExternalDocuments } from '../data/external-documents';
import { requestExternalStatutoryDocumentForPaymentCommitted } from './request-external-statutory-for-payment';

/**
 * Runs AFTER payment commit — provider failure must not affect the payment.
 */
export async function triggerStatutoryAfterPayment(
  userId: string,
  organizationId: string,
  paymentId: string,
  billingRecordId: string,
): Promise<void> {
  const { runInOrgContext } = await import('@/shared/auth/session');

  const plan = await runInOrgContext(userId, organizationId, async (context) => {
    const settings = await getOrgInvoicingSettings(context);
    if (!shouldAutoIssueReceiptAfterPayment(settings)) {
      return null;
    }

    const billing = await getBillingRecord(context, billingRecordId);
    const existing = await listExternalDocuments(context, billingRecordId);
    const taxInvoice = findBlockingExternalDocument(existing, 'tax_invoice');

    let kind: ExternalDocumentKind;
    if (
      settings.paymentDocumentPolicy === 'tax_invoice_receipt_on_payment' &&
      !taxInvoice
    ) {
      kind = 'tax_invoice_receipt';
    } else if (taxInvoice) {
      kind = 'receipt';
    } else if (settings.paymentDocumentPolicy === 'tax_invoice_then_receipt') {
      // Tax invoice must exist first — skip auto receipt until invoice is issued.
      return null;
    } else {
      kind = 'tax_invoice_receipt';
    }

    const blockingReceipt = findBlockingExternalDocument(
      existing.filter((doc) => doc.paymentId === paymentId),
      kind,
    );
    if (blockingReceipt) return null;

    return {
      kind,
      linkedTaxInvoiceExternalId: taxInvoice?.externalId ?? null,
    };
  });

  if (!plan) return;

  try {
    await requestExternalStatutoryDocumentForPaymentCommitted(
      userId,
      organizationId,
      paymentId,
      billingRecordId,
      plan.kind,
      plan.linkedTaxInvoiceExternalId,
    );
  } catch (error) {
    console.error('[statutory-after-payment] issuance failed (payment preserved)', {
      organizationId,
      paymentId,
      billingRecordId,
      kind: plan.kind,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function scheduleStatutoryAfterPayment(
  userId: string,
  organizationId: string,
  paymentId: string,
  billingRecordId: string,
): void {
  void triggerStatutoryAfterPayment(userId, organizationId, paymentId, billingRecordId);
}
