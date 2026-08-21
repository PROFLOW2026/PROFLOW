/**
 * Branding domain types — company identity + multi-brand profiles + snapshots.
 * Document branding ≠ UI theme. Portal stays OFF.
 */

export type HeaderLayout = 'letterhead' | 'logo_sides' | 'centered' | 'minimal';
export type FooterStyle = 'minimal' | 'detailed' | 'legal';
export type DocumentTheme = 'customer' | 'internal';
export type TemplatePreset = 'standard' | 'minimal' | 'formal' | 'detailed';
export type BrandProfileStatus = 'active' | 'archived';

export type BrandAssetKind =
  | 'logo_primary'
  | 'logo_compact'
  | 'logo_dark'
  | 'logo_light'
  | 'signature'
  | 'stamp';

export type BrandSnapshotEntityType =
  | 'quote'
  | 'purchase_order'
  | 'rfq'
  | 'contract'
  | 'change_order'
  | 'boq'
  | 'boq_progress_batch'
  | 'report'
  | 'work_order'
  | 'service_report'
  | 'daily_log'
  | 'inspection'
  | 'form_submission'
  | 'safety_record'
  | 'timesheet'
  | 'billing_record'
  | 'customer_statement'
  | 'subcontract'
  | 'closeout'
  | 'warranty'
  | 'warranty_issue'
  | 'communication';

export interface ExtraIdentifier {
  readonly label: string;
  readonly value: string;
}

export interface CompanyProfile {
  readonly id: string;
  readonly organizationId: string;
  readonly legalName: string;
  readonly displayName: string;
  readonly tradingName: string | null;
  readonly registrationNumber: string | null;
  readonly vatTaxId: string | null;
  readonly extraIdentifiers: readonly ExtraIdentifier[];
  readonly website: string | null;
  readonly mainEmail: string | null;
  readonly mainPhone: string | null;
  readonly secondaryPhone: string | null;
  readonly whatsappPhone: string | null;
  readonly billingEmail: string | null;
  readonly salesEmail: string | null;
  readonly supportEmail: string | null;
  readonly addressLine1: string | null;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandProfile {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly isDefault: boolean;
  readonly status: BrandProfileStatus;
  readonly logoPrimaryKey: string | null;
  readonly logoPrimaryContentType: string | null;
  readonly logoPrimaryByteSize: number | null;
  readonly logoPrimaryWidth: number | null;
  readonly logoPrimaryHeight: number | null;
  readonly logoCompactKey: string | null;
  readonly logoCompactContentType: string | null;
  readonly logoDarkKey: string | null;
  readonly logoDarkContentType: string | null;
  readonly logoLightKey: string | null;
  readonly logoLightContentType: string | null;
  readonly signatureImageKey: string | null;
  readonly signatureImageContentType: string | null;
  readonly stampImageKey: string | null;
  readonly stampImageContentType: string | null;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly headerLayout: HeaderLayout;
  readonly footerStyle: FooterStyle;
  readonly documentTheme: DocumentTheme;
  readonly templatePreset: TemplatePreset;
  readonly showLogo: boolean;
  readonly showLegalName: boolean;
  readonly showDisplayName: boolean;
  readonly showRegistrationNumber: boolean;
  readonly showVatTaxId: boolean;
  readonly showAddress: boolean;
  readonly showPhone: boolean;
  readonly showEmail: boolean;
  readonly showWebsite: boolean;
  readonly showPageNumbers: boolean;
  readonly showGeneratedDate: boolean;
  readonly showDocumentReference: boolean;
  readonly allowSignatureOnQuotes: boolean;
  readonly allowSignatureOnReports: boolean;
  readonly allowStamp: boolean;
  readonly includeSignatureByDefault: boolean;
  readonly includeStampByDefault: boolean;
  readonly footerCustomText: string | null;
  readonly quoteFooterText: string | null;
  readonly quoteTermsText: string | null;
  readonly reportFooterText: string | null;
  readonly paymentInstructionsText: string | null;
  readonly generalDocumentNote: string | null;
  readonly emailSignatureText: string | null;
  readonly poTermsText: string | null;
  readonly serviceReportNote: string | null;
  readonly reportDisclaimerText: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** JSON-serializable freeze of company + brand for issued/final documents. */
export interface BrandSnapshot {
  readonly version: 1;
  readonly brandProfileId: string | null;
  readonly brandProfileName: string | null;
  readonly companyLegalName: string;
  readonly companyDisplayName: string;
  readonly tradingName: string | null;
  readonly registrationNumber: string | null;
  readonly vatTaxId: string | null;
  readonly addressLines: readonly string[];
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly website: string | null;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly headerLayout: HeaderLayout;
  readonly footerStyle: FooterStyle;
  readonly documentTheme: DocumentTheme;
  readonly templatePreset: TemplatePreset;
  readonly showLogo: boolean;
  readonly showLegalName: boolean;
  readonly showDisplayName: boolean;
  readonly showRegistrationNumber: boolean;
  readonly showVatTaxId: boolean;
  readonly showAddress: boolean;
  readonly showPhone: boolean;
  readonly showEmail: boolean;
  readonly showWebsite: boolean;
  readonly showPageNumbers: boolean;
  readonly showGeneratedDate: boolean;
  readonly showDocumentReference: boolean;
  readonly allowSignatureOnQuotes: boolean;
  readonly allowSignatureOnReports: boolean;
  readonly allowStamp: boolean;
  readonly includeSignatureByDefault: boolean;
  readonly includeStampByDefault: boolean;
  /** Storage object keys (entityType `branding`) — not Documents OCR paths. */
  readonly logoPrimaryKey: string | null;
  readonly logoPrimaryContentType: string | null;
  readonly logoDarkKey: string | null;
  readonly logoDarkContentType: string | null;
  readonly logoCompactKey: string | null;
  readonly logoCompactContentType: string | null;
  readonly logoLightKey: string | null;
  readonly logoLightContentType: string | null;
  readonly signatureImageKey: string | null;
  readonly signatureImageContentType: string | null;
  readonly stampImageKey: string | null;
  readonly stampImageContentType: string | null;
  readonly footerCustomText: string | null;
  readonly quoteFooterText: string | null;
  readonly quoteTermsText: string | null;
  readonly reportFooterText: string | null;
  readonly paymentInstructionsText: string | null;
  readonly generalDocumentNote: string | null;
  readonly emailSignatureText: string | null;
  readonly poTermsText: string | null;
  readonly serviceReportNote: string | null;
  readonly reportDisclaimerText: string | null;
  readonly capturedAt: string;
}

export interface DocumentBrandSnapshotRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly entityType: BrandSnapshotEntityType;
  readonly entityId: string;
  readonly brandProfileId: string | null;
  readonly snapshot: BrandSnapshot;
  readonly createdAt: Date;
}

export const DEFAULT_PRIMARY_COLOR = '#0F766E';
export const DEFAULT_SECONDARY_COLOR = '#334155';
