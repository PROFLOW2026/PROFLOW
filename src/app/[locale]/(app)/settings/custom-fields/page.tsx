import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listCustomFieldDefinitions } from '@/modules/custom-fields';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { CustomFieldsPanel } from './custom-fields-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('customFields');
}

export default async function CustomFieldsSettingsPage() {
  const t = await getTranslations('customFields');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'customFields')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const definitions = await listCustomFieldDefinitions(context);
    return {
      allowed: true as const,
      definitions,
      canEdit: canManageSection(context, 'customFields'),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('title')}>
      <Card className="p-5">
        <CustomFieldsPanel definitions={data.definitions} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
