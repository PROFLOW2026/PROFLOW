import 'server-only';

import {
  listExternalDocuments,
  listExternalDocumentsForPayment,
} from '../data/external-documents';
import { getOrgInvoicingSettings } from '../data/org-invoicing-settings.repository';
import { planStatutoryIssuanceAfterPayment } from '../domain/plan-statutory-after-payment';
import { requestExternalStatutoryDocumentForPaymentCommitted } from './request-external-statutory-for-payment';

export interface StatutoryPaymentAllocation {
  readonly billingRecordId: string;
  readonly allocatedAmount: string;
}

/**
 * Runs AFTER payment commit — provider failure must not affect the payment.
 * Does not issue a second tax invoice. A second receipt of the same kind for
 * the same payment id is skipped (existing idempotency key and unique index).
 */
export async function triggerStatutoryAfterPayment(
  userId: string,
  organizationId: string,
  paymentId: string,
  billingRecordId: string,
  options?: { readonly allocatedAmount?: string | null },
): Promise<void> {
  const { runInOrgContext } = await import('@/shared/auth/session');

  const plan = await runInOrgContext(userId, organizationId, async (context) => {
    const settings = await getOrgInvoicingSettings(context);
    const billingDocuments = await listExternalDocuments(context, billingRecordId);
    const paymentDocuments = await listExternalDocumentsForPayment(context, paymentId);
    return planStatutoryIssuanceAfterPayment({
      settings,
      billingDocuments,
      paymentDocuments,
      paymentId,
      billingRecordId,
    });
  });

  if (plan.action === 'skip') return;

  try {
    await requestExternalStatutoryDocumentForPaymentCommitted(
      userId,
      organizationId,
      paymentId,
      billingRecordId,
      plan.kind,
      plan.linkedTaxInvoiceExternalId,
      undefined,
      options?.allocatedAmount ?? null,
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
  options?: { readonly allocatedAmount?: string | null },
): void {
  void triggerStatutoryAfterPayment(
    userId,
    organizationId,
    paymentId,
    billingRecordId,
    options,
  ).catch((error) => {
    console.error('[statutory-after-payment] schedule failed (payment preserved)', {
      organizationId,
      paymentId,
      billingRecordId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

/**
 * One receipt decision per allocation, in order, after the payment has committed.
 * A SUMIT failure is logged and does not roll the payment back.
 */
export async function triggerStatutoryAfterAllocatedPayments(
  userId: string,
  organizationId: string,
  paymentId: string,
  allocations: readonly StatutoryPaymentAllocation[],
): Promise<void> {
  for (const allocation of allocations) {
    if (!allocation.billingRecordId || !allocation.allocatedAmount.trim()) continue;
    await triggerStatutoryAfterPayment(
      userId,
      organizationId,
      paymentId,
      allocation.billingRecordId,
      { allocatedAmount: allocation.allocatedAmount },
    );
  }
}

export function scheduleStatutoryAfterAllocatedPayments(
  userId: string,
  organizationId: string,
  paymentId: string,
  allocations: readonly StatutoryPaymentAllocation[],
): void {
  void triggerStatutoryAfterAllocatedPayments(
    userId,
    organizationId,
    paymentId,
    allocations,
  ).catch((error) => {
    console.error('[statutory-after-payment] schedule failed (payment preserved)', {
      organizationId,
      paymentId,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}
