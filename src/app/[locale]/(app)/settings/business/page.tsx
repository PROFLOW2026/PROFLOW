import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { getCompanyProfile } from '@/modules/branding';
import { withOrgContext } from '@/shared/auth/session';
import { getBusinessProfileKeyForOrg, getOrganizationLegalIdentity } from '@/modules/tenancy';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { BusinessProfileForm } from './business-profile-form';
import { BusinessProfilePresetForm } from './business-profile-preset-form';
import { CompanyDetailsForm } from './company-details-form';
import { LegalIdentityForm } from './legal-identity-form';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('business');
}

export default async function BusinessSettingsPage() {
  const t = await getTranslations('settings.companyDetails');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'business')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) {
      return { allowed: false as const };
    }

    const [companyProfile, currentProfileKey, legalIdentity] = await Promise.all([
      getCompanyProfile(context),
      getBusinessProfileKeyForOrg(context.db, context.organizationId),
      getOrganizationLegalIdentity(context.db, context.organizationId),
    ]);

    return {
      allowed: true as const,
      organization: context.organization,
      canEdit: canManageSection(context, 'business'),
      currentProfileKey,
      companyProfile,
      legalIdentity,
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('pageTitle')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  const companyValues = {
    legalName: data.companyProfile.legalName || data.organization.name,
    displayName: data.companyProfile.displayName || data.organization.name,
    tradingName: data.companyProfile.tradingName,
    registrationNumber:
      data.companyProfile.registrationNumber ?? data.legalIdentity.companyNumber,
    vatTaxId: data.companyProfile.vatTaxId ?? data.legalIdentity.taxId,
    website: data.companyProfile.website,
    mainEmail: data.companyProfile.mainEmail,
    mainPhone: data.companyProfile.mainPhone,
    secondaryPhone: data.companyProfile.secondaryPhone,
    whatsappPhone: data.companyProfile.whatsappPhone,
    billingEmail: data.companyProfile.billingEmail,
    salesEmail: data.companyProfile.salesEmail,
    supportEmail: data.companyProfile.supportEmail,
    addressLine1: data.companyProfile.addressLine1,
    addressLine2: data.companyProfile.addressLine2,
    city: data.companyProfile.city,
    region: data.companyProfile.region,
    postalCode: data.companyProfile.postalCode,
    countryCode: data.companyProfile.countryCode ?? data.organization.countryCode,
  };

  return (
    <SettingsPageShell title={t('pageTitle')} description={t('pageDescription')}>
      <div className="flex flex-col gap-6">
        <Card className="flex flex-col gap-6 p-4 sm:p-5">
          <CompanyDetailsForm values={companyValues} canEdit={data.canEdit} />
        </Card>

        <Card className="flex flex-col gap-6 p-4 sm:p-5">
          <BusinessProfileForm organization={data.organization} canEdit={data.canEdit} />
          <LegalIdentityForm
            taxId={companyValues.vatTaxId}
            companyNumber={companyValues.registrationNumber}
            canEdit={data.canEdit}
          />
          <BusinessProfilePresetForm canEdit={data.canEdit} currentProfileKey={data.currentProfileKey} />
        </Card>
      </div>
    </SettingsPageShell>
  );
}
