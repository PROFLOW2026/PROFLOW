/**
 * Resolve live brand: org default → project brand → document override.
 * Builds JSON BrandSnapshot for freezing on issue/finalize.
 */

import type { CompanyProfile, BrandProfile, BrandSnapshot } from './types';
import { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from './types';

export interface ResolveBrandInput {
  readonly company: CompanyProfile;
  readonly defaultBrand: BrandProfile | null;
  readonly projectBrand: BrandProfile | null;
  /** Explicit document-level brand profile (quote / PO / etc.). */
  readonly documentBrand: BrandProfile | null;
}

export interface ResolvedBrand {
  readonly company: CompanyProfile;
  readonly brand: BrandProfile | null;
  readonly source: 'document' | 'project' | 'org_default' | 'none';
}

export function resolveBrandSelection(input: ResolveBrandInput): ResolvedBrand {
  if (input.documentBrand && input.documentBrand.status === 'active') {
    return { company: input.company, brand: input.documentBrand, source: 'document' };
  }
  if (input.projectBrand && input.projectBrand.status === 'active') {
    return { company: input.company, brand: input.projectBrand, source: 'project' };
  }
  if (input.defaultBrand && input.defaultBrand.status === 'active') {
    return { company: input.company, brand: input.defaultBrand, source: 'org_default' };
  }
  return { company: input.company, brand: null, source: 'none' };
}

function pushUnique(list: string[], value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (trimmed && !list.includes(trimmed)) list.push(trimmed);
}

export function buildAddressLines(company: CompanyProfile): string[] {
  const lines: string[] = [];
  pushUnique(lines, company.addressLine1);
  pushUnique(lines, company.addressLine2);
  const cityLine = [company.city, company.region, company.postalCode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');
  if (cityLine) lines.push(cityLine);
  if (company.countryCode?.trim()) lines.push(company.countryCode.trim().toUpperCase());
  return lines;
}

export function buildPhoneList(company: CompanyProfile): string[] {
  const phones: string[] = [];
  pushUnique(phones, company.mainPhone);
  pushUnique(phones, company.secondaryPhone);
  pushUnique(phones, company.whatsappPhone);
  return phones;
}

export function buildEmailList(company: CompanyProfile): string[] {
  const emails: string[] = [];
  pushUnique(emails, company.mainEmail);
  pushUnique(emails, company.billingEmail);
  pushUnique(emails, company.salesEmail);
  pushUnique(emails, company.supportEmail);
  return emails;
}

/** Pure snapshot builder from resolved company + brand. */
export function buildBrandSnapshot(
  company: CompanyProfile,
  brand: BrandProfile | null,
  capturedAt: Date = new Date(),
): BrandSnapshot {
  return {
    version: 1,
    brandProfileId: brand?.id ?? null,
    brandProfileName: brand?.name ?? null,
    companyLegalName: company.legalName,
    companyDisplayName: company.displayName,
    tradingName: company.tradingName,
    registrationNumber: company.registrationNumber,
    vatTaxId: company.vatTaxId,
    addressLines: buildAddressLines(company),
    phones: buildPhoneList(company),
    emails: buildEmailList(company),
    website: company.website,
    primaryColor: brand?.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: brand?.secondaryColor ?? DEFAULT_SECONDARY_COLOR,
    headerLayout: brand?.headerLayout ?? 'letterhead',
    footerStyle: brand?.footerStyle ?? 'detailed',
    documentTheme: brand?.documentTheme ?? 'customer',
    templatePreset: brand?.templatePreset ?? 'standard',
    showLogo: brand?.showLogo ?? true,
    showLegalName: brand?.showLegalName ?? true,
    showDisplayName: brand?.showDisplayName ?? true,
    showRegistrationNumber: brand?.showRegistrationNumber ?? true,
    showVatTaxId: brand?.showVatTaxId ?? true,
    showAddress: brand?.showAddress ?? true,
    showPhone: brand?.showPhone ?? true,
    showEmail: brand?.showEmail ?? true,
    showWebsite: brand?.showWebsite ?? true,
    showPageNumbers: brand?.showPageNumbers ?? true,
    showGeneratedDate: brand?.showGeneratedDate ?? true,
    showDocumentReference: brand?.showDocumentReference ?? true,
    allowSignatureOnQuotes: brand?.allowSignatureOnQuotes ?? false,
    allowSignatureOnReports: brand?.allowSignatureOnReports ?? false,
    allowStamp: brand?.allowStamp ?? false,
    includeSignatureByDefault: brand?.includeSignatureByDefault ?? false,
    includeStampByDefault: brand?.includeStampByDefault ?? false,
    logoPrimaryKey: brand?.logoPrimaryKey ?? null,
    logoPrimaryContentType: brand?.logoPrimaryContentType ?? null,
    logoDarkKey: brand?.logoDarkKey ?? null,
    logoDarkContentType: brand?.logoDarkContentType ?? null,
    logoCompactKey: brand?.logoCompactKey ?? null,
    logoCompactContentType: brand?.logoCompactContentType ?? null,
    logoLightKey: brand?.logoLightKey ?? null,
    logoLightContentType: brand?.logoLightContentType ?? null,
    signatureImageKey: brand?.signatureImageKey ?? null,
    signatureImageContentType: brand?.signatureImageContentType ?? null,
    stampImageKey: brand?.stampImageKey ?? null,
    stampImageContentType: brand?.stampImageContentType ?? null,
    footerCustomText: brand?.footerCustomText ?? null,
    quoteFooterText: brand?.quoteFooterText ?? null,
    quoteTermsText: brand?.quoteTermsText ?? null,
    reportFooterText: brand?.reportFooterText ?? null,
    paymentInstructionsText: brand?.paymentInstructionsText ?? null,
    generalDocumentNote: brand?.generalDocumentNote ?? null,
    emailSignatureText: brand?.emailSignatureText ?? null,
    poTermsText: brand?.poTermsText ?? null,
    serviceReportNote: brand?.serviceReportNote ?? null,
    reportDisclaimerText: brand?.reportDisclaimerText ?? null,
    capturedAt: capturedAt.toISOString(),
  };
}

export function resolveAndBuildSnapshot(input: ResolveBrandInput): {
  resolved: ResolvedBrand;
  snapshot: BrandSnapshot;
} {
  const resolved = resolveBrandSelection(input);
  return {
    resolved,
    snapshot: buildBrandSnapshot(resolved.company, resolved.brand),
  };
}
