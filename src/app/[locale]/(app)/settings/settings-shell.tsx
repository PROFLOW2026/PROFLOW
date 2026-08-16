import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { accessibleSections } from './_lib/access';
import { SettingsSectionNav } from './settings-section-nav';

export async function SettingsPageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const navItems = await withOrgContext(async (context) =>
    accessibleSections(context).map((section) => ({
      key: section.key,
      href: section.href,
      group: section.group,
    })),
  );

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      <PageHeader title={title} description={description} />

      <div className="flex w-full min-w-0 flex-col gap-6 lg:flex-row lg:items-start">
        <aside className="w-full min-w-0 shrink-0 lg:w-52">
          <SettingsSectionNav items={navItems} />
        </aside>
        <div className="min-w-0 max-w-full flex-1">{children}</div>
      </div>
    </div>
  );
}

export async function settingsMetadata(sectionKey: string) {
  const t = await getTranslations('settings');
  return { title: `${t(`sections.${sectionKey}`)} - ${t('title')}` };
}
