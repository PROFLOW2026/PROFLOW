/**
 * Vendors domain types. Framework-free.
 */

export const VENDOR_TYPES = ['supplier', 'subcontractor', 'both', 'other'] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const VENDOR_STATUSES = ['active', 'inactive'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const CONTACT_ROLES = ['primary', 'billing', 'site', 'other'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

/** Same set as client party identifiers (party_identifiers.type). */
export const VENDOR_IDENTIFIER_TYPES = [
  'tax_id',
  'company_number',
  'vat_number',
  'license_number',
  'other',
] as const;
export type VendorIdentifierType = (typeof VENDOR_IDENTIFIER_TYPES)[number];

/** Engagement lifecycle - not a cost / Actual signal. */
export const ENGAGEMENT_STATUSES = ['active', 'ended', 'cancelled'] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

export const VENDOR_CATALOG_LINK_KINDS = ['vendor_category', 'vendor_specialty'] as const;
export type VendorCatalogLinkKind = (typeof VENDOR_CATALOG_LINK_KINDS)[number];

export interface VendorRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly type: VendorType;
  readonly status: VendorStatus;
  readonly tier: string | null;
  readonly parentVendorId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly countryCode: string | null;
  readonly notes: string | null;
  /** Org catalog entry (kind=payment_term). */
  readonly defaultPaymentTermId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorIdentifierRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly type: VendorIdentifierType;
  readonly value: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorCatalogLinkRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly catalogEntryId: string;
  readonly linkKind: VendorCatalogLinkKind;
  readonly entryName: string;
  readonly entryKey: string;
}

export interface VendorContactRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly name: string;
  readonly role: ContactRole;
  readonly email: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorEngagementRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly projectId: string;
  readonly role: string | null;
  readonly notes: string | null;
  /** Inclusive business date (YYYY-MM-DD); optional until dated engagements are used. */
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly status: EngagementStatus;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorListFilters {
  readonly search?: string;
  readonly status?: VendorStatus | 'all';
  readonly type?: VendorType | 'all';
  /** Filter vendors linked to this catalog category (vendor_category). */
  readonly categoryId?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export interface VendorListItem extends VendorRecord {
  readonly projectCount: number;
  readonly engagementCount: number;
  readonly categoryNames: readonly string[];
}

export interface VendorEngagementSummary extends VendorEngagementRecord {
  readonly projectName: string;
}

/** Project → contractors roster row (engagement ≠ cost). */
export interface ProjectVendorEngagementSummary extends VendorEngagementRecord {
  readonly vendorName: string;
  readonly vendorType: VendorType;
}

export interface VendorDetail extends VendorRecord {
  readonly contacts: readonly VendorContactRecord[];
  readonly engagements: readonly VendorEngagementSummary[];
  readonly identifiers: readonly VendorIdentifierRecord[];
  readonly catalogLinks: readonly VendorCatalogLinkRecord[];
  readonly parentVendorName: string | null;
  readonly defaultPaymentTermName: string | null;
  readonly projectCount: number;
}
