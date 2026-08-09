/**
 * External portal domain (doc 25).
 * ExternalPrincipal is not an OrganizationMembership.
 */

export const PORTAL_KINDS = ['customer', 'vendor'] as const;
export type PortalKind = (typeof PORTAL_KINDS)[number];

export const GRANT_STATUSES = ['active', 'revoked', 'expired'] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/** Customer portal scopes supported in this foundation. */
export const CUSTOMER_PORTAL_SCOPES = [
  'project.summary',
  'billing.outstanding',
  'documents.read',
] as const;

export type CustomerPortalScope = (typeof CUSTOMER_PORTAL_SCOPES)[number];

export interface ExternalPrincipalRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly authUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExternalAccessGrantRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly principalId: string;
  readonly portalKind: PortalKind;
  readonly clientId: string | null;
  readonly projectId: string | null;
  readonly scopes: readonly string[];
  readonly status: GrantStatus;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExternalAccessGrantListItem extends ExternalAccessGrantRecord {
  readonly principalEmail: string;
  readonly principalDisplayName: string | null;
  readonly clientName: string | null;
  readonly projectName: string | null;
}

/**
 * Customer-visible project projection. Must never include costs, profit,
 * workforce rates, vendor confidential data, or overhead.
 */
export interface CustomerSafeProjectSummary {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly progressPercent: string | null;
  readonly progressStatus: string | null;
  readonly startDate: string | null;
  readonly targetEndDate: string | null;
  readonly location: string | null;
  readonly description: string | null;
  readonly clientName: string | null;
  /** Present only when the grant includes `billing.outstanding`. */
  readonly outstanding?: {
    readonly amount: string;
    readonly currency: string;
  };
}
