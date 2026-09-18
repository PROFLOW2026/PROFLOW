import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '@/modules/tenancy/data/organization-settings.repository';
import {
  DEFAULT_ORG_INVOICING_SETTINGS,
  INVOICING_PAYMENT_DOCUMENT_POLICY_KEY,
  INVOICING_RECEIPT_ISSUANCE_KEY,
  INVOICING_STATUTORY_MODE_KEY,
  type InvoicingPaymentDocumentPolicy,
  type InvoicingReceiptIssuance,
  type InvoicingStatutoryMode,
  type OrgInvoicingSettings,
  parseOrgInvoicingSettings,
} from '../domain/org-invoicing-settings';

let orgInvoicingSettingsOverrideForTests: OrgInvoicingSettings | null = null;

export function setOrgInvoicingSettingsForTests(settings: OrgInvoicingSettings | null): void {
  orgInvoicingSettingsOverrideForTests = settings;
}

async function readRawSettings(context: OrgContext): Promise<OrgInvoicingSettings> {
  if (orgInvoicingSettingsOverrideForTests) {
    return orgInvoicingSettingsOverrideForTests;
  }
  const [mode, policy, receiptIssuance] = await Promise.all([
    getOrganizationSettingValue<InvoicingStatutoryMode>(
      context.db,
      context.organizationId,
      INVOICING_STATUTORY_MODE_KEY,
    ),
    getOrganizationSettingValue<InvoicingPaymentDocumentPolicy>(
      context.db,
      context.organizationId,
      INVOICING_PAYMENT_DOCUMENT_POLICY_KEY,
    ),
    getOrganizationSettingValue<InvoicingReceiptIssuance>(
      context.db,
      context.organizationId,
      INVOICING_RECEIPT_ISSUANCE_KEY,
    ),
  ]);

  return parseOrgInvoicingSettings({
    mode,
    paymentDocumentPolicy: policy,
    receiptIssuance,
  });
}

export async function getOrgInvoicingSettings(context: OrgContext): Promise<OrgInvoicingSettings> {
  return readRawSettings(context);
}

export async function upsertOrgInvoicingSettings(
  context: OrgContext,
  patch: Partial<OrgInvoicingSettings>,
): Promise<OrgInvoicingSettings> {
  const current = await readRawSettings(context);
  const next: OrgInvoicingSettings = {
    mode: patch.mode ?? current.mode,
    paymentDocumentPolicy: patch.paymentDocumentPolicy ?? current.paymentDocumentPolicy,
    receiptIssuance: patch.receiptIssuance ?? current.receiptIssuance,
  };

  await Promise.all([
    upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      INVOICING_STATUTORY_MODE_KEY,
      next.mode,
    ),
    upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      INVOICING_PAYMENT_DOCUMENT_POLICY_KEY,
      next.paymentDocumentPolicy,
    ),
    upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      INVOICING_RECEIPT_ISSUANCE_KEY,
      next.receiptIssuance,
    ),
  ]);

  return next;
}

export { DEFAULT_ORG_INVOICING_SETTINGS };
