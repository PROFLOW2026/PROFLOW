/** Organization-level statutory invoicing mode — stored in organization_settings JSON. */

export const INVOICING_STATUTORY_MODE_KEY = 'invoicing_statutory_mode';
export const INVOICING_PAYMENT_DOCUMENT_POLICY_KEY = 'invoicing_payment_document_policy';
export const INVOICING_RECEIPT_ISSUANCE_KEY = 'invoicing_receipt_issuance';

export type InvoicingStatutoryMode = 'manual' | 'external_provider';

export type InvoicingPaymentDocumentPolicy =
  | 'tax_invoice_then_receipt'
  | 'tax_invoice_receipt_on_payment'
  | 'transaction_invoice_before_payment';

export type InvoicingReceiptIssuance = 'automatic' | 'manual';

export interface OrgInvoicingSettings {
  readonly mode: InvoicingStatutoryMode;
  readonly paymentDocumentPolicy: InvoicingPaymentDocumentPolicy;
  readonly receiptIssuance: InvoicingReceiptIssuance;
}

export const DEFAULT_ORG_INVOICING_SETTINGS: OrgInvoicingSettings = {
  mode: 'manual',
  paymentDocumentPolicy: 'tax_invoice_then_receipt',
  receiptIssuance: 'automatic',
};

function parseMode(value: unknown): InvoicingStatutoryMode {
  return value === 'external_provider' ? 'external_provider' : 'manual';
}

function parsePolicy(value: unknown): InvoicingPaymentDocumentPolicy {
  if (value === 'tax_invoice_receipt_on_payment') return 'tax_invoice_receipt_on_payment';
  if (value === 'transaction_invoice_before_payment') {
    return 'transaction_invoice_before_payment';
  }
  return 'tax_invoice_then_receipt';
}

function parseReceiptIssuance(value: unknown): InvoicingReceiptIssuance {
  return value === 'manual' ? 'manual' : 'automatic';
}

export function parseOrgInvoicingSettings(raw: unknown): OrgInvoicingSettings {
  if (!raw || typeof raw !== 'object') return DEFAULT_ORG_INVOICING_SETTINGS;
  const record = raw as Record<string, unknown>;
  return {
    mode: parseMode(record.mode),
    paymentDocumentPolicy: parsePolicy(record.paymentDocumentPolicy),
    receiptIssuance: parseReceiptIssuance(record.receiptIssuance),
  };
}

export function isExternalProviderStatutoryMode(settings: OrgInvoicingSettings): boolean {
  return settings.mode === 'external_provider';
}

export function shouldAutoIssueReceiptAfterPayment(settings: OrgInvoicingSettings): boolean {
  return (
    isExternalProviderStatutoryMode(settings) && settings.receiptIssuance === 'automatic'
  );
}
