import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { getOrgStructureTemplatesBag } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { TemplatesSettingsPanel } from './templates-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('templates');
}

export default async function TemplatesSettingsPage() {
  const t = await getTranslations('settings.templates');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'templates')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const bag = await getOrgStructureTemplatesBag(context);
    return {
      allowed: true as const,
      bag,
      canEdit: canManageSection(context, 'templates'),
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
        <TemplatesSettingsPanel bag={data.bag} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
