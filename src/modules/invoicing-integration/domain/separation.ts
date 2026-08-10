import { DomainRuleError } from '@/shared/errors';
import type { BillingRecordBridgeRef } from './types';

/**
 * Hard separation: Billing Record (management) ≠ External Statutory Document.
 * ProjectFlow never issues statutory invoices locally.
 */

export function assertBillingIsNotStatutoryIssuer(): void {
  // Intentional no-op guard point for call sites / future lint hooks.
  // Local minting of statutory numbers is forbidden by module contract.
}

export function assertBillingEligibleForExternalRequest(billing: BillingRecordBridgeRef): void {
  if (billing.status !== 'finalized') {
    throw new DomainRuleError(
      'Only finalized billing records can request an external statutory document',
      'invoicingIntegration.errors.billingNotFinalized',
      { status: billing.status },
    );
  }
}

export function assertNotLocalStatutoryIssuance(providerId: string): void {
  if (providerId === 'local' || providerId === 'projectflow-local') {
    throw new DomainRuleError(
      'Local statutory invoice issuance is forbidden',
      'invoicingIntegration.errors.localIssuanceForbidden',
      { providerId },
    );
  }
}

/** Copy keys that make the Billing vs External Document distinction explicit in UI. */
export const SEPARATION_MESSAGE_KEYS = {
  billingRecordLabel: 'invoicingIntegration.separation.billingRecord',
  externalDocumentLabel: 'invoicingIntegration.separation.externalDocument',
  disclosure: 'invoicingIntegration.separation.disclosure',
} as const;
