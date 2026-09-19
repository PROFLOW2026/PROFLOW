import type { Metadata } from 'next';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import { getOrganizationSettingValue } from '@/modules/tenancy';
import { SettingsPageShell } from '../settings-shell';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { AdoptionPanel } from './adoption-panel';
import {
  ORG_PROFILE_TYPE_SETTING_KEY,
  isOrgProfileType,
  type OrgProfileType,
} from '../org-profile/org-profile-domain';

export const metadata: Metadata = { title: 'Org Adoption' };

export default async function AdoptionSettingsPage() {
  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.SETTINGS_MANAGE)) {
      return { allowed: false as const };
    }

    const rawProfileType = await getOrganizationSettingValue<string>(
      context.db,
      context.organizationId,
      ORG_PROFILE_TYPE_SETTING_KEY,
    );

    const currentProfileType: OrgProfileType | null =
      isOrgProfileType(rawProfileType) ? rawProfileType : null;

    return { allowed: true as const, currentProfileType };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title="Org Adoption">
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell
      title="Org Adoption"
      description="Apply default stage definitions, module settings, and terminology for your organization profile type."
    >
      <Card className="p-5">
        <AdoptionPanel currentProfileType={data.currentProfileType} />
      </Card>
    </SettingsPageShell>
  );
}
