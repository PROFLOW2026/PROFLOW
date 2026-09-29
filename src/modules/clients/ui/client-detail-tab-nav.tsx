'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';
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
      className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)] pb-px [scrollbar-width:thin]"
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
