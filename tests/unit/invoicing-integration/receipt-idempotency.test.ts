import { describe, expect, it } from 'vitest';
import {
  buildStatutoryIdempotencyKey,
  isPaymentLinkedStatutoryKind,
} from '@/modules/invoicing-integration/domain/idempotency-key';
import {
  parseOrgInvoicingSettings,
  shouldAutoIssueReceiptAfterPayment,
} from '@/modules/invoicing-integration/domain/org-invoicing-settings';

describe('payment receipt idempotency', () => {
  it('uses payment-scoped keys for receipts', () => {
    const paymentId = 'pay-001';
    const billingId = 'bill-001';
    expect(buildStatutoryIdempotencyKey(billingId, 'receipt', paymentId)).toBe(
      `pf:payment:${paymentId}:receipt:v1`,
    );
    expect(buildStatutoryIdempotencyKey(billingId, 'tax_invoice_receipt', paymentId)).toBe(
      `pf:payment:${paymentId}:tax_invoice_receipt:v1`,
    );
  });

  it('keeps billing-scoped keys for tax invoices', () => {
    expect(buildStatutoryIdempotencyKey('bill-001', 'tax_invoice')).toBe(
      'pf:bill-001:tax_invoice:v1',
    );
  });

  it('identifies payment-linked kinds', () => {
    expect(isPaymentLinkedStatutoryKind('receipt')).toBe(true);
    expect(isPaymentLinkedStatutoryKind('tax_invoice')).toBe(false);
  });
});

describe('org invoicing settings', () => {
  it('defaults to manual mode', () => {
    const settings = parseOrgInvoicingSettings(null);
    expect(settings.mode).toBe('manual');
    expect(shouldAutoIssueReceiptAfterPayment(settings)).toBe(false);
  });

  it('auto receipt only in external provider mode', () => {
    const settings = parseOrgInvoicingSettings({
      mode: 'external_provider',
      receiptIssuance: 'automatic',
    });
    expect(shouldAutoIssueReceiptAfterPayment(settings)).toBe(true);
  });
});
