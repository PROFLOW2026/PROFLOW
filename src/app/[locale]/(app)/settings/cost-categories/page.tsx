import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listCostCategories } from '../_lib/cost-categories';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { CostCategoriesPanel } from './cost-categories-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('costCategories');
}

export default async function CostCategoriesSettingsPage() {
  const t = await getTranslations('settings.costCategories');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'costCategories')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };
    const categories = await listCostCategories(context);
    return {
      allowed: true as const,
      categories,
      canEdit: canManageSection(context, 'costCategories'),
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
        <CostCategoriesPanel categories={data.categories} canEdit={data.canEdit} />
      </Card>
    </SettingsPageShell>
  );
}
