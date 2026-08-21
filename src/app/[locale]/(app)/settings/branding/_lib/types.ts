/**
 * Serializable branding DTOs for Settings UI.
 * Runtime functions come from `@/modules/branding` — Lead aligns names if needed.
 */

export type HeaderLayoutPreset = 'letterhead' | 'logo_sides' | 'centered' | 'minimal';
export type FooterStylePreset = 'minimal' | 'detailed' | 'legal';

export type BrandAssetKind =
  | 'logo_primary'
  | 'logo_compact'
  | 'logo_dark'
  | 'logo_light'
  | 'signature'
  | 'stamp';

export interface BrandingCompanySummary {
  legalName: string;
  displayName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatTaxId: string | null;
  website: string | null;
  mainEmail: string | null;
  mainPhone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  countryCode: string | null;
}

export interface BrandProfileSettingsView {
  id: string;
  name: string;
  isDefault: boolean;
  status: 'active' | 'archived';
  primaryColor: string;
  secondaryColor: string;
  headerLayout: HeaderLayoutPreset;
  footerStyle: FooterStylePreset;
  showLogo: boolean;
  showLegalName: boolean;
  showDisplayName: boolean;
  showRegistrationNumber: boolean;
  showVatTaxId: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showEmail: boolean;
  showWebsite: boolean;
  showPageNumbers: boolean;
  showGeneratedDate: boolean;
  showDocumentReference: boolean;
  allowSignatureOnQuotes: boolean;
  allowSignatureOnReports: boolean;
  allowStamp: boolean;
  includeSignatureByDefault: boolean;
  includeStampByDefault: boolean;
  footerCustomText: string | null;
  quoteFooterText: string | null;
  quoteTermsText: string | null;
  reportFooterText: string | null;
  paymentInstructionsText: string | null;
  generalDocumentNote: string | null;
  emailSignatureText: string | null;
  poTermsText: string | null;
  serviceReportNote: string | null;
  reportDisclaimerText: string | null;
  logoPrimaryUrl: string | null;
  logoCompactUrl: string | null;
  logoDarkUrl: string | null;
  logoLightUrl: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  hasLogoPrimary: boolean;
  hasSignature: boolean;
  hasStamp: boolean;
}
