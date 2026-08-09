/**
 * Vendors domain types. Framework-free.
 */

export const VENDOR_TYPES = ['supplier', 'subcontractor', 'both', 'other'] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const VENDOR_STATUSES = ['active', 'inactive'] as const;
export type VendorStatus = (typeof VENDOR_STATUSES)[number];

export const CONTACT_ROLES = ['primary', 'billing', 'site', 'other'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

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
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
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
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface VendorListFilters {
  readonly search?: string;
  readonly status?: VendorStatus | 'all';
  readonly type?: VendorType | 'all';
  readonly includeArchived?: boolean;
}

export interface VendorListItem extends VendorRecord {
  readonly projectCount: number;
  readonly engagementCount: number;
}

export interface VendorEngagementSummary extends VendorEngagementRecord {
  readonly projectName: string;
}

export interface VendorDetail extends VendorRecord {
  readonly contacts: readonly VendorContactRecord[];
  readonly engagements: readonly VendorEngagementSummary[];
  readonly parentVendorName: string | null;
  readonly projectCount: number;
}
