import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { getOrganizationSettingValue } from '@/modules/tenancy';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { OrgProfilePanel } from './org-profile-panel';
import {
  ORG_PROFILE_TYPE_SETTING_KEY,
  TERMINOLOGY_OVERRIDE_SETTING_KEY,
  isOrgProfileType,
  type OrgProfileType,
  type TerminologyOverrides,
} from './org-profile-domain';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('orgProfile');
}

export default async function OrgProfileSettingsPage() {
  const tNav = await getTranslations('settings.orgProfile');
  const tPanel = await getTranslations('settings.orgProfilePanel');
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.SETTINGS_MANAGE)) {
      return { allowed: false as const };
    }

    const [rawProfileType, rawTerminology] = await Promise.all([
      getOrganizationSettingValue<string>(
        context.db,
        context.organizationId,
        ORG_PROFILE_TYPE_SETTING_KEY,
      ),
      getOrganizationSettingValue<TerminologyOverrides>(
        context.db,
        context.organizationId,
        TERMINOLOGY_OVERRIDE_SETTING_KEY,
      ),
    ]);

    const currentProfileType: OrgProfileType | null =
      isOrgProfileType(rawProfileType) ? rawProfileType : null;

    const terminologyOverrides: TerminologyOverrides =
      rawTerminology && typeof rawTerminology === 'object' ? rawTerminology : {};

    return {
      allowed: true as const,
      currentProfileType,
      terminologyOverrides,
      canEdit: hasPermission(context, PERMISSIONS.SETTINGS_MANAGE),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={tNav('nav')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={tNav('nav')} description={tPanel('pageDescription')}>
      <Card className="p-5">
        <OrgProfilePanel
          currentProfileType={data.currentProfileType}
          terminologyOverrides={data.terminologyOverrides}
          canEdit={data.canEdit}
        />
      </Card>
    </SettingsPageShell>
  );
}
