import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import {
  accessibleSections,
  groupSettingsSections,
  SETTINGS_NAV_GROUP_ORDER,
  type SettingsNavGroup,
  type SettingsSectionKey,
} from './_lib/access';

type SettingsHubGroupCard = {
  readonly group: SettingsNavGroup;
  readonly href: string;
  readonly sectionKeys: readonly SettingsSectionKey[];
};
import { SettingsGroupHub } from './settings-nav-shell';

export async function SettingsHubPage() {
  const t = await getTranslations('settings');
  const sections = await withOrgContext(async (context) => accessibleSections(context));
  const grouped = groupSettingsSections(sections);

  const hubGroups: SettingsHubGroupCard[] = SETTINGS_NAV_GROUP_ORDER.filter((g) => g !== 'developers')
    .map((group) => {
      const entry = grouped.find((row) => row.group === group);
      if (!entry || entry.items.length === 0) return null;
      return {
        group,
        href: entry.items[0]!.href,
        sectionKeys: entry.items.map((item) => item.key),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  const devEntry = grouped.find((row) => row.group === 'developers');
  const devGroups: SettingsHubGroupCard[] = [];
  if (devEntry && devEntry.items.length > 0) {
    devGroups.push({
      group: 'developers' as SettingsNavGroup,
      href: devEntry.items[0]!.href,
      sectionKeys: devEntry.items.map((item) => item.key),
    });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader title={t('title')} description={t('hub.description')} />
      <SettingsGroupHub groups={[...hubGroups, ...devGroups]} />
    </div>
  );
}
