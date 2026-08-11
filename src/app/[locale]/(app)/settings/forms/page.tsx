import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listFormTemplatesForOrg } from '@/modules/forms';
import { FormTemplatesPanel } from '@/modules/forms/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('forms');
}

export default async function FormsSettingsPage() {
  const t = await getTranslations('forms');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'forms')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const templates = await listFormTemplatesForOrg(context, { includeArchived: false });
    return {
      allowed: true as const,
      templates,
      canEdit: hasPermission(context, PERMISSIONS.FORMS_MANAGE),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('settings.title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('settings.title')} description={t('settings.subtitle')}>
      <Card className="p-5">
        <FormTemplatesPanel templates={data.templates} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
