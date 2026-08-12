/**
 * Organization legal / tax identity — pure parsers (no persistence).
 * Stored value lives in organization_settings JSON key `legal_identity`.
 */

export const LEGAL_IDENTITY_SETTING_KEY = 'legal_identity';

export interface OrganizationLegalIdentity {
  readonly taxId: string | null;
  readonly companyNumber: string | null;
}

function normalizeOrgIdentifier(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 9) return digits;
  if (digits.length === 8) return digits.padStart(9, '0');
  return digits.length >= 5 ? digits : null;
}

export function parseOrganizationLegalIdentity(raw: unknown): OrganizationLegalIdentity {
  if (!raw || typeof raw !== 'object') {
    return { taxId: null, companyNumber: null };
  }
  const record = raw as Record<string, unknown>;
  const taxId =
    typeof record.taxId === 'string' ? normalizeOrgIdentifier(record.taxId) : null;
  const companyNumber =
    typeof record.companyNumber === 'string'
      ? normalizeOrgIdentifier(record.companyNumber)
      : null;
  return { taxId, companyNumber };
}

/** Prefer taxId, then companyNumber — both are Israeli business identifiers. */
export function resolveOrganizationTaxId(identity: OrganizationLegalIdentity): string | null {
  return identity.taxId ?? identity.companyNumber;
}
