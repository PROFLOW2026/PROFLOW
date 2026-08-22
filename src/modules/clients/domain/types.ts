/**
 * Clients domain types. Framework-free.
 */

export const CLIENT_STATUSES = ['active', 'inactive'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const CONTACT_ROLES = ['primary', 'billing', 'site', 'other'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const IDENTIFIER_TYPES = [
  'tax_id',
  'company_number',
  'vat_number',
  'license_number',
  'other',
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export interface ClientRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: ClientStatus;
  readonly legalName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly notes: string | null;
  /** Org catalog entry (kind=client_type). */
  readonly clientTypeId: string | null;
  /** Org catalog entry (kind=payment_term). */
  readonly defaultPaymentTermId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ClientContactRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly clientId: string;
  readonly name: string;
  readonly role: ContactRole;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PartyIdentifierRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly clientId: string | null;
  readonly vendorId: string | null;
  readonly type: IdentifierType;
  readonly value: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ClientListItem extends ClientRecord {
  readonly projectCount: number;
  readonly clientTypeName: string | null;
}

export interface ClientListFilters {
  readonly search?: string;
  readonly status?: ClientStatus | 'all';
  readonly clientTypeId?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface ClientDetail extends ClientRecord {
  readonly contacts: readonly ClientContactRecord[];
  readonly identifiers: readonly PartyIdentifierRecord[];
  readonly projectCount: number;
  readonly clientTypeName: string | null;
  readonly defaultPaymentTermName: string | null;
  readonly defaultPaymentTermKey: string | null;
}
