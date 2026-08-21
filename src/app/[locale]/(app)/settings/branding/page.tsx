import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import {
  ensureDefaultBranding,
  getCompanyProfile,
  listBrandProfiles,
  resolveBrandAssetSignedUrl,
} from '@/modules/branding';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { BrandingSettingsPanel } from './branding-panel';
import type { BrandProfileSettingsView, HeaderLayoutPreset, FooterStylePreset } from './_lib/types';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('branding');
}

async function toSettingsView(
  brand: Awaited<ReturnType<typeof listBrandProfiles>>[number],
  resolveUrl: (key: string | null | undefined) => Promise<string | null>,
): Promise<BrandProfileSettingsView> {
  const [
    logoPrimaryUrl,
    logoCompactUrl,
    logoDarkUrl,
    logoLightUrl,
    signatureUrl,
    stampUrl,
  ] = await Promise.all([
    resolveUrl(brand.logoPrimaryKey),
    resolveUrl(brand.logoCompactKey),
    resolveUrl(brand.logoDarkKey),
    resolveUrl(brand.logoLightKey),
    resolveUrl(brand.signatureImageKey),
    resolveUrl(brand.stampImageKey),
  ]);

  return {
    id: brand.id,
    name: brand.name,
    isDefault: brand.isDefault,
    status: brand.status === 'archived' ? 'archived' : 'active',
    primaryColor: brand.primaryColor,
    secondaryColor: brand.secondaryColor,
    headerLayout: brand.headerLayout as HeaderLayoutPreset,
    footerStyle: brand.footerStyle as FooterStylePreset,
    showLogo: brand.showLogo,
    showLegalName: brand.showLegalName,
    showDisplayName: brand.showDisplayName,
    showRegistrationNumber: brand.showRegistrationNumber,
    showVatTaxId: brand.showVatTaxId,
    showAddress: brand.showAddress,
    showPhone: brand.showPhone,
    showEmail: brand.showEmail,
    showWebsite: brand.showWebsite,
    showPageNumbers: brand.showPageNumbers,
    showGeneratedDate: brand.showGeneratedDate,
    showDocumentReference: brand.showDocumentReference,
    allowSignatureOnQuotes: brand.allowSignatureOnQuotes,
    allowSignatureOnReports: brand.allowSignatureOnReports,
    allowStamp: brand.allowStamp,
    includeSignatureByDefault: brand.includeSignatureByDefault,
    includeStampByDefault: brand.includeStampByDefault,
    footerCustomText: brand.footerCustomText,
    quoteFooterText: brand.quoteFooterText,
    quoteTermsText: brand.quoteTermsText,
    reportFooterText: brand.reportFooterText,
    paymentInstructionsText: brand.paymentInstructionsText,
    generalDocumentNote: brand.generalDocumentNote,
    emailSignatureText: brand.emailSignatureText,
    poTermsText: brand.poTermsText,
    serviceReportNote: brand.serviceReportNote,
    reportDisclaimerText: brand.reportDisclaimerText,
    logoPrimaryUrl,
    logoCompactUrl,
    logoDarkUrl,
    logoLightUrl,
    signatureUrl,
    stampUrl,
    hasLogoPrimary: Boolean(brand.logoPrimaryKey),
    hasSignature: Boolean(brand.signatureImageKey),
    hasStamp: Boolean(brand.stampImageKey),
  };
}

export default async function BrandingSettingsPage() {
  const t = await getTranslations('settings.branding');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'branding')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    await ensureDefaultBranding(context.db, context.organizationId, {
      name: context.organization.name,
      countryCode: context.organization.countryCode,
    });

    const [companyProfile, brandRows] = await Promise.all([
      getCompanyProfile(context),
      listBrandProfiles(context),
    ]);

    const brands = await Promise.all(
      brandRows.map((brand) =>
        toSettingsView(brand, async (key) => {
          if (!key) return null;
          const signed = await resolveBrandAssetSignedUrl(context, key);
          return signed?.url ?? null;
        }),
      ),
    );

    return {
      allowed: true as const,
      canEdit: canManageSection(context, 'branding'),
      company: {
        legalName: companyProfile.legalName || context.organization.name,
        displayName: companyProfile.displayName || context.organization.name,
        tradingName: companyProfile.tradingName,
        registrationNumber: companyProfile.registrationNumber,
        vatTaxId: companyProfile.vatTaxId,
        website: companyProfile.website,
        mainEmail: companyProfile.mainEmail,
        mainPhone: companyProfile.mainPhone,
        addressLine1: companyProfile.addressLine1,
        addressLine2: companyProfile.addressLine2,
        city: companyProfile.city,
        region: companyProfile.region,
        postalCode: companyProfile.postalCode,
        countryCode: companyProfile.countryCode ?? context.organization.countryCode,
      },
      brands,
      initialBrandId: brands.find((b) => b.isDefault)?.id ?? brands[0]?.id ?? null,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('pageTitle')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('pageTitle')} description={t('pageDescription')}>
      <Card className="p-4 sm:p-5">
        <BrandingSettingsPanel
          brands={data.brands}
          company={data.company}
          canEdit={data.canEdit}
          initialBrandId={data.initialBrandId}
        />
      </Card>
    </SettingsPageShell>
  );
}
