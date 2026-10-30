'use client';

import { useTranslations } from 'next-intl';
import { mainAppDetailRouteTabListClassName } from '@/components/patterns/main-app/main-app-detail-tabs-shell';
import { SectionNavLink } from '@/components/ui/section-nav-link';
import { cn } from '@/shared/ui/cn';
import {
  CLIENT_DETAIL_TABS,
  type ClientDetailTabKey,
  clientDetailTabHref,
} from './client-detail-tab-order';

export function ClientDetailTabNav({
  clientId,
  activeTab,
}: {
  readonly clientId: string;
  readonly activeTab: ClientDetailTabKey;
}) {
  const t = useTranslations('clients.detail.tabs');

  return (
    <nav
      aria-label={t('navLabel')}
      className={cn(mainAppDetailRouteTabListClassName, '-mx-1 pb-px')}
    >
      {CLIENT_DETAIL_TABS.map((tab) => (
        <SectionNavLink
          key={tab}
          href={clientDetailTabHref(clientId, tab)}
          active={activeTab === tab}
          className="shrink-0 whitespace-nowrap px-3 py-2 text-sm"
        >
          {t(tab)}
        </SectionNavLink>
      ))}
    </nav>
  );
}
