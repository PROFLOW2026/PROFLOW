import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listDocumentNumberSettings } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { NumberingSettingsPanel } from './numbering-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('numbering');
}

export default async function NumberingSettingsPage() {
  const t = await getTranslations('settings.numbering');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'numbering')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const sequences = await listDocumentNumberSettings(context);
    return {
      allowed: true as const,
      sequences,
      canEdit: canManageSection(context, 'numbering'),
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
        <NumberingSettingsPanel sequences={data.sequences} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
