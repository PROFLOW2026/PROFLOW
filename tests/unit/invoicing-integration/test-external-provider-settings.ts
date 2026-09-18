import type { OrgInvoicingSettings } from '@/modules/invoicing-integration/domain/org-invoicing-settings';
import { setOrgInvoicingSettingsForTests } from '@/modules/invoicing-integration/data/org-invoicing-settings.repository';

export const TEST_EXTERNAL_PROVIDER_SETTINGS: OrgInvoicingSettings = {
  mode: 'external_provider',
  paymentDocumentPolicy: 'tax_invoice_then_receipt',
  receiptIssuance: 'automatic',
};

export function enableExternalProviderSettingsForTests(): void {
  setOrgInvoicingSettingsForTests(TEST_EXTERNAL_PROVIDER_SETTINGS);
}

export function resetOrgInvoicingSettingsForTests(): void {
  setOrgInvoicingSettingsForTests(null);
}
