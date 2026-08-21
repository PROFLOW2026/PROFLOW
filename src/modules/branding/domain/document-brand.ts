/**
 * DocumentBrandContext — runtime brand for PDF/HTML renderers.
 *
 * Aligns with BrandSnapshot (JSON freeze) but may carry decoded logo/signature bytes.
 * Rules:
 *  - companyLegalName / companyDisplayName are always present.
 *  - Logo bytes are optional; renderers must handle absent logo (name fallback).
 *  - Signature/stamp are visual acknowledgement only — NOT legal e-signatures.
 *  - theme='customer' | 'internal'; dir / locale drive RTL and formatting.
 */

import type { BrandSnapshot, HeaderLayout } from './types';

export type { HeaderLayout } from './types';

/** Resolved hex color, already validated for contrast when coming from branding domain. */
export type BrandColor = string;

export interface DocumentBrandContext {
  // ── Identity ────────────────────────────────────────────────────────────────
  readonly companyLegalName: string;
  readonly companyDisplayName: string;
  readonly tradingName?: string | null;

  // ── Contact details (all optional) ──────────────────────────────────────────
  readonly addressLines?: readonly string[];
  readonly phones?: readonly string[];
  readonly emails?: readonly string[];
  readonly website?: string | null;
  readonly vatNumber?: string | null;
  readonly registrationNumber?: string | null;

  // ── Visual brand ────────────────────────────────────────────────────────────
  readonly primaryColor?: BrandColor | null;
  readonly accentColor?: BrandColor | null;
  readonly secondaryColor?: BrandColor | null;
  /** Light logo suitable for coloured backgrounds (may be white/light). */
  readonly logoBytes?: Uint8Array | null;
  readonly logoMime?: string | null;
  /** Dark/primary logo suitable for white paper — preferred when background is white. */
  readonly darkLogoBytes?: Uint8Array | null;
  readonly darkLogoMime?: string | null;
  /** Storage keys from BrandSnapshot (when bytes not loaded yet). */
  readonly logoPrimaryKey?: string | null;
  readonly logoDarkKey?: string | null;

  // ── Layout ──────────────────────────────────────────────────────────────────
  readonly headerLayout?: HeaderLayout;
  readonly footerStyle?: BrandSnapshot['footerStyle'];
  readonly footerText?: string | null;
  readonly footerSecondaryText?: string | null;
  readonly emailSignatureText?: string | null;
  readonly quoteTermsText?: string | null;
  readonly reportDisclaimerText?: string | null;

  // ── Signature / stamp (visual only — NOT legal e-sign) ───────────────────────
  readonly signatureBytes?: Uint8Array | null;
  readonly signatureMime?: string | null;
  readonly stampBytes?: Uint8Array | null;
  readonly stampMime?: string | null;
  readonly signatureImageKey?: string | null;
  readonly stampImageKey?: string | null;
  readonly includeSignature?: boolean;
  readonly includeStamp?: boolean;

  // ── Visibility flags ────────────────────────────────────────────────────────
  readonly showLogo?: boolean;
  readonly showLegalName?: boolean;
  readonly showDisplayName?: boolean;
  readonly showRegistrationNumber?: boolean;
  readonly showVatNumber?: boolean;
  readonly showAddress?: boolean;
  readonly showPhone?: boolean;
  readonly showEmail?: boolean;
  readonly showWebsite?: boolean;
  readonly showPageNumbers?: boolean;
  readonly showGeneratedDate?: boolean;
  readonly showDocumentReference?: boolean;

  // ── Document context ────────────────────────────────────────────────────────
  readonly theme: 'customer' | 'internal';
  readonly dir: 'rtl' | 'ltr';
  readonly locale: string;
  readonly brandProfileId?: string | null;
  readonly snapshotCapturedAt?: string | null;
}

/** Minimal version used when only a company name is known. */
export function minimalBrandContext(
  companyName: string,
  locale: string,
  dir: 'rtl' | 'ltr',
  theme: 'customer' | 'internal' = 'customer',
): DocumentBrandContext {
  return {
    companyLegalName: companyName,
    companyDisplayName: companyName,
    theme,
    dir,
    locale,
    headerLayout: 'letterhead',
  };
}

/**
 * Map a frozen BrandSnapshot into DocumentBrandContext (keys only — no byte fetch).
 * Callers that need logo/signature bytes load them via StoragePort separately.
 */
export function documentBrandFromSnapshot(
  snapshot: BrandSnapshot,
  locale: string,
  dir: 'rtl' | 'ltr',
  options?: {
    readonly includeSignature?: boolean;
    readonly includeStamp?: boolean;
    readonly footerText?: string | null;
    readonly footerSecondaryText?: string | null;
  },
): DocumentBrandContext {
  return {
    companyLegalName: snapshot.companyLegalName,
    companyDisplayName: snapshot.companyDisplayName,
    tradingName: snapshot.tradingName,
    addressLines: snapshot.addressLines,
    phones: snapshot.phones,
    emails: snapshot.emails,
    website: snapshot.website,
    vatNumber: snapshot.vatTaxId,
    registrationNumber: snapshot.registrationNumber,
    primaryColor: snapshot.primaryColor,
    accentColor: snapshot.secondaryColor,
    secondaryColor: snapshot.secondaryColor,
    logoPrimaryKey: snapshot.logoPrimaryKey,
    logoDarkKey: snapshot.logoDarkKey,
    logoMime: snapshot.logoPrimaryContentType,
    darkLogoMime: snapshot.logoDarkContentType,
    headerLayout: snapshot.headerLayout,
    footerStyle: snapshot.footerStyle,
    footerText: options?.footerText ?? snapshot.footerCustomText,
    footerSecondaryText: options?.footerSecondaryText ?? snapshot.reportFooterText,
    emailSignatureText: snapshot.emailSignatureText,
    quoteTermsText: snapshot.quoteTermsText,
    reportDisclaimerText: snapshot.reportDisclaimerText,
    signatureImageKey: snapshot.signatureImageKey,
    stampImageKey: snapshot.stampImageKey,
    signatureMime: snapshot.signatureImageContentType,
    stampMime: snapshot.stampImageContentType,
    includeSignature: options?.includeSignature ?? snapshot.includeSignatureByDefault,
    includeStamp: options?.includeStamp ?? snapshot.includeStampByDefault,
    showLogo: snapshot.showLogo,
    showLegalName: snapshot.showLegalName,
    showDisplayName: snapshot.showDisplayName,
    showRegistrationNumber: snapshot.showRegistrationNumber,
    showVatNumber: snapshot.showVatTaxId,
    showAddress: snapshot.showAddress,
    showPhone: snapshot.showPhone,
    showEmail: snapshot.showEmail,
    showWebsite: snapshot.showWebsite,
    showPageNumbers: snapshot.showPageNumbers,
    showGeneratedDate: snapshot.showGeneratedDate,
    showDocumentReference: snapshot.showDocumentReference,
    theme: snapshot.documentTheme,
    dir,
    locale,
    brandProfileId: snapshot.brandProfileId,
    snapshotCapturedAt: snapshot.capturedAt,
  };
}
