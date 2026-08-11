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
  'milestones.read',
  /** Customer-facing quote status/totals only — never estimated cost/margin. */
  'quotes.read',
] as const;

export type CustomerPortalScope = (typeof CUSTOMER_PORTAL_SCOPES)[number];

/**
 * Vendor portal scopes — external users never mutate financial truth.
 * `quote.submit` / `bill.candidate` / `documents.upload` create candidates only.
 * `payment.outstanding` is grantable but policy-gated until AP payments are safe.
 */
export const VENDOR_PORTAL_SCOPES = [
  'vendor.summary',
  'documents.read',
  'documents.upload',
  'rfq.read',
  'quote.submit',
  'po.view',
  'bill.candidate',
  'payment.outstanding',
] as const;

export type VendorPortalScope = (typeof VENDOR_PORTAL_SCOPES)[number];

/**
 * External portal session for a customer grant.
 * ExternalPrincipal != OrganizationMembership — never treat as OrgContext.
 */
export interface CustomerPortalSession {
  readonly kind: 'customer_portal';
  readonly organizationId: string;
  readonly principalId: string;
  readonly principalEmail: string;
  readonly grantId: string;
  readonly clientId: string | null;
  readonly projectId: string | null;
  readonly scopes: readonly CustomerPortalScope[];
}

/**
 * External portal session for a vendor grant.
 * ExternalPrincipal != OrganizationMembership — never treat as OrgContext.
 */
export interface VendorPortalSession {
  readonly kind: 'vendor_portal';
  readonly organizationId: string;
  readonly principalId: string;
  readonly principalEmail: string;
  readonly grantId: string;
  readonly vendorId: string;
  readonly scopes: readonly VendorPortalScope[];
}

/** Portal AP bill submission — candidate only; never an ap_bills / Expense row. */
export interface VendorApBillCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly grantId: string;
  readonly principalId: string;
  readonly reference: string | null;
  readonly currency: string;
  readonly totalAmount: string;
  readonly billDate: string | null;
  readonly notes: string | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
  }[];
  readonly status: 'candidate' | 'accepted_for_review' | 'rejected';
  readonly mutatesFinancialTruth: false;
  readonly createdAt: string;
  readonly reviewedAt?: string | null;
  readonly reviewNote?: string | null;
}

/** Document / compliance upload candidate — pending internal review. */
export interface VendorComplianceUploadCandidate {
  readonly id: string;
  readonly organizationId: string;
  readonly vendorId: string;
  readonly grantId: string;
  readonly principalId: string;
  readonly artifactKind: 'insurance' | 'license' | 'certification' | 'other';
  readonly name: string;
  readonly referenceNumber: string | null;
  readonly expiresOn: string | null;
  readonly notes: string | null;
  readonly status: 'candidate' | 'accepted_for_review' | 'rejected';
  readonly mutatesFinancialTruth: false;
  readonly createdAt: string;
  readonly reviewedAt?: string | null;
  readonly reviewNote?: string | null;
}

/**
 * Vendor-facing AP payment / outstanding position.
 * Never includes cost recognition, profit, or internal match variance.
 * Empty while vendor payment policy is disabled.
 */
export interface VendorSafePaymentOutstanding {
  readonly policyStatus: 'disabled' | 'enabled';
  readonly currency: string | null;
  readonly billedAmount: string | null;
  readonly paidAmount: string | null;
  readonly outstandingAmount: string | null;
  readonly note: string;
}

/**
 * Vendor-safe RFQ projection. No internal cost or profit fields.
 * RFQ↔vendor invite linkage is not in V1 schema — visibility is grant-scoped
 * to sent RFQs for the organization when `rfq.read` is granted.
 */
export interface VendorSafeRfqSummary {
  readonly rfqId: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly projectName: string | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unit: string | null;
  }[];
}

/**
 * Vendor-safe PO summary. Exposes order totals the vendor already knows;
 * never includes internal committed-cost ledger status, profit, or margin.
 */
export interface VendorSafePoSummary {
  readonly purchaseOrderId: string;
  readonly reference: string | null;
  readonly status: string;
  readonly currency: string;
  /** Vendor-facing order total (PO line sum / committed amount on the order). */
  readonly orderTotal: string;
  readonly orderedOn: string | null;
  readonly projectName: string | null;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
  }[];
}

export interface VendorPortalPreview {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly scopes: readonly VendorPortalScope[];
  readonly rfqs: readonly VendorSafeRfqSummary[];
  readonly purchaseOrders: readonly VendorSafePoSummary[];
  /** AP bill candidates queued for internal review (never ap_bills rows). */
  readonly apBillCandidates: readonly VendorApBillCandidate[];
  /** Compliance upload candidates queued for internal review. */
  readonly complianceCandidates: readonly VendorComplianceUploadCandidate[];
  /**
   * Present only when grant includes `payment.outstanding`.
   * Policy may still return disabled until AP payments are safe to expose.
   */
  readonly paymentOutstanding?: VendorSafePaymentOutstanding;
  /**
   * Compliance / bill uploads are candidate-only when scoped.
   * Canonical documents / AP require internal acceptance.
   */
  readonly candidateIntakeNote: 'candidates_only';
  /**
   * RFQ browse is limited to RFQs already associated with this vendor
   * (via supplier_quote). Full invite table is deferred — no org-wide RFQ dump.
   */
  readonly rfqVisibility: 'vendor_associated_only';
  /** Public vendor login remains disabled (not merely foundation-only). */
  readonly publicLoginStatus: 'disabled';
  /** ExternalPrincipal ≠ OrganizationMembership. */
  readonly identityModel: 'external_principal';
}

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
  readonly vendorId: string | null;
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
  readonly vendorName: string | null;
}

/**
 * Customer-visible document metadata. Never includes storage paths,
 * checksums, uploader ids, or admin/audit fields.
 */
export interface CustomerSafeDocument {
  readonly documentId: string;
  readonly filename: string;
  readonly label: string | null;
  readonly mimeType: string;
  readonly sizeBytes: number | null;
}

/**
 * Customer-visible milestone. Never includes internal notes or cost links.
 */
export interface CustomerSafeMilestone {
  readonly milestoneId: string;
  readonly name: string;
  readonly status: string;
  readonly targetDate: string | null;
  readonly completedAt: string | null;
}

/**
 * Customer-facing commercial quote (sent onward). Never includes estimated
 * cost, margin, internal notes, or draft/ready-only internal quotes.
 */
export interface CustomerSafeQuote {
  readonly quoteId: string;
  readonly title: string;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: string | null;
  readonly validityDate: string | null;
  readonly sentAt: string | null;
}

/**
 * Customer-visible billing/payment row. Never includes cost, margin, or
 * internal notes. Draft/void records are excluded by the builder.
 */
export interface CustomerSafeBillingItem {
  readonly billingRecordId: string;
  readonly reference: string | null;
  readonly kind: string;
  readonly status: string;
  readonly issueDate: string | null;
  readonly dueDate: string | null;
  readonly totalAmount: string;
  readonly paidAmount: string;
  readonly outstandingAmount: string;
  readonly currency: string;
  readonly payments: readonly {
    readonly amount: string;
    readonly currency: string;
    readonly status: string;
    readonly paymentDate: string | null;
    readonly reference: string | null;
  }[];
}

/**
 * Customer-visible project projection. Must never include costs, profit,
 * workforce rates, vendor confidential data, overhead, or internal notes.
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
  /** Present only when the grant includes `billing.outstanding`. */
  readonly billing?: {
    readonly invoicedAmount: string;
    readonly paidAmount: string;
    readonly currency: string;
    readonly items: readonly CustomerSafeBillingItem[];
  };
  /** Present only when the grant includes `documents.read` (shared docs only). */
  readonly documents?: readonly CustomerSafeDocument[];
  /** Present only when the grant includes `milestones.read`. */
  readonly milestones?: readonly CustomerSafeMilestone[];
  /** Present only when the grant includes `quotes.read`. */
  readonly quotes?: readonly CustomerSafeQuote[];
}
