import { describe, expect, it } from 'vitest';
import { shouldAutoIssueReceiptAfterPayment } from '@/modules/invoicing-integration/domain/org-invoicing-settings';

describe('receipt auto issuance gating', () => {
  it('does not auto-issue receipts in collection-only mode', () => {
    expect(
      shouldAutoIssueReceiptAfterPayment({
        mode: 'manual',
        paymentDocumentPolicy: 'tax_invoice_receipt_on_payment',
        receiptIssuance: 'automatic',
      }),
    ).toBe(false);
  });

  it('auto-issues receipts only in accounting mode with automatic setting', () => {
    expect(
      shouldAutoIssueReceiptAfterPayment({
        mode: 'external_provider',
        paymentDocumentPolicy: 'tax_invoice_receipt_on_payment',
        receiptIssuance: 'automatic',
      }),
    ).toBe(true);
  });
});
