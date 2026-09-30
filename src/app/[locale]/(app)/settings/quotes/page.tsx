import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listQuoteSettingsBlocks } from '@/modules/quotes/application/manage-quote-settings';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { QuoteSettingsPanel } from './quote-settings-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('quotes');
}

export default async function QuoteSettingsPage() {
  const t = await getTranslations('quotes.settings');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'quotes')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const blocks = await listQuoteSettingsBlocks(context);
    return {
      allowed: true as const,
      blocks,
      canEdit: hasPermission(context, PERMISSIONS.QUOTES_MANAGE) && canManageSection(context, 'quotes'),
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
    <SettingsPageShell title={t('title')} description={t('subtitle')}>
      <Card className="p-5">
        <QuoteSettingsPanel blocks={data.blocks} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
