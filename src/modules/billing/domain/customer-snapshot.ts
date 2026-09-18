import type { ClientRecord, PartyIdentifierRecord } from '@/modules/clients/domain/types';
import type { BillingVatMode } from './tax';
import type { CustomerSnapshot } from './types';

function formatAddress(client: ClientRecord): string | null {
  const parts = [client.addressLine1, client.addressLine2].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

function pickCompanyNumber(identifiers: readonly PartyIdentifierRecord[]): string | null {
  for (const type of ['company_number', 'tax_id', 'vat_number'] as const) {
    const match = identifiers.find((row) => row.type === type);
    if (match?.value.trim()) return match.value.trim();
  }
  return null;
}

/**
 * Whether the buyer is VAT-exempt for external statutory issuance (SUMIT Customer.NoVAT).
 * This is independent of whether a company registration number is stored on the client.
 */
export function resolveCustomerNoVat(
  billingVatMode: BillingVatMode | null | undefined,
): boolean {
  return billingVatMode === 'zero';
}

export function captureCustomerSnapshot(
  client: ClientRecord,
  identifiers: readonly PartyIdentifierRecord[],
  options?: {
    readonly billingVatMode?: BillingVatMode | null;
  },
): CustomerSnapshot {
  const companyNumber = pickCompanyNumber(identifiers);
  return {
    name: client.legalName?.trim() || client.name,
    companyNumber,
    externalIdentifier: client.id,
    email: client.email,
    phone: client.phone,
    address: formatAddress(client),
    city: client.city,
    postalCode: client.postalCode,
    noVat: resolveCustomerNoVat(options?.billingVatMode),
  };
}
