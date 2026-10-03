export const TENDER_PACKAGE_STATUSES = ['draft', 'inviting', 'evaluating', 'awarded', 'cancelled'] as const;
export type TenderPackageStatus = (typeof TENDER_PACKAGE_STATUSES)[number];

export const TENDER_OFFER_STATUSES = ['draft', 'submitted', 'withdrawn', 'selected', 'rejected'] as const;
export type TenderOfferStatus = (typeof TENDER_OFFER_STATUSES)[number];

export const TENDER_PACKAGE_ENTITY = 'tender_package' as const;
export const TENDER_OFFER_ENTITY = 'tender_offer' as const;

export interface TenderPackageRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly workPackageId: string | null;
  readonly tradeKey: string;
  readonly title: string;
  readonly scopeDescription: string | null;
  readonly status: TenderPackageStatus;
  readonly awardedVendorId: string | null;
  readonly awardedAgreementId: string | null;
}

export interface TenderInvitationRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly packageId: string;
  readonly vendorId: string;
  readonly status: string;
}

export interface TenderOfferRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly packageId: string;
  readonly vendorId: string;
  readonly invitationId: string;
  readonly status: TenderOfferStatus;
  readonly notes: string | null;
}
