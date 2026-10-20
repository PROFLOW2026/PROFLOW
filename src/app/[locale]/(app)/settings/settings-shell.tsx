import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { PageHeader } from '@/components/ui/page-header';
import { withOrgContext } from '@/shared/auth/session';
import { accessibleSections } from './_lib/access';
import { SettingsNavShell } from './settings-nav-shell';

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
    <MainAppPage>
      <PageHeader title={title} description={description} className="gap-2" />
      <MainAppSection>
        <div className="flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-start">
          <aside className="w-full min-w-0 shrink-0 lg:w-56">
            <SettingsNavShell items={navItems} />
          </aside>
          <div className="min-w-0 max-w-full flex-1">{children}</div>
        </div>
      </MainAppSection>
    </MainAppPage>
  );
}

export async function settingsMetadata(sectionKey: string) {
  const t = await getTranslations('settings');
  return { title: `${t(`sections.${sectionKey}`)} - ${t('title')}` };
}
