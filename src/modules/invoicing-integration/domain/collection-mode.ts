import type { OrgInvoicingSettings } from './org-invoicing-settings';
import { isExternalProviderStatutoryMode } from './org-invoicing-settings';

/** Mode 1 — collection only; invoices/receipts issued outside ProjectFlow. */
export function isCollectionOnlyMode(settings: OrgInvoicingSettings): boolean {
  return !isExternalProviderStatutoryMode(settings);
}

/** Mode 2 — collection plus connected accounting for invoices/receipts. */
export function isAccountingInvoicingMode(settings: OrgInvoicingSettings): boolean {
  return isExternalProviderStatutoryMode(settings);
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  sumit: 'SUMIT',
};

/** Human-readable provider name for UI — not hard-coded into collection flows. */
export function resolveAccountingProviderDisplayName(providerId: string | null | undefined): string | null {
  if (!providerId || providerId === 'unconfigured') return null;
  return PROVIDER_DISPLAY_NAMES[providerId] ?? providerId.toUpperCase();
}
