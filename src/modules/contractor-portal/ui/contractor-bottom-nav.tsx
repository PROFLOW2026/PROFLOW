'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from '@/shared/i18n/navigation';
import { PendingChromeLink } from '@/components/ui/pending-chrome-link';
import { cn } from '@/shared/ui/cn';
import { activeContractorMobileTab, contractorMobileTabIconKey } from '../domain/mobile-tabs';
import type { PortalNavItem } from '../domain/nav';
import { PortalNavIcon } from './portal-nav-icon';

export function ContractorBottomNav({ items }: { items: readonly PortalNavItem[] }) {
  const t = useTranslations('contractorPortal');
  const pathname = usePathname();
  const activeTab = activeContractorMobileTab(pathname);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 box-border w-full min-w-0 max-w-full border-t border-[var(--pf-border-default)] bg-[color-mix(in_srgb,var(--pf-bg-surface)_94%,transparent)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden print:hidden supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--pf-bg-surface)_88%,transparent)]"
      aria-label={t('shell.navLabel')}
      data-pf-contractor-mobile-nav=""
    >
      <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
        {items.map((item) => {
          const active = item.key === activeTab;
          const iconKey = contractorMobileTabIconKey(item.key as Parameters<typeof contractorMobileTabIconKey>[0]);
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <PendingChromeLink
                href={item.href}
                active={active}
                className={cn(
                  'relative flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                  active
                    ? 'text-[var(--pf-accent)]'
                    : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                )}
                icon={<PortalNavIcon navKey={iconKey} className="size-5" />}
              >
                {active ? (
                  <span
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-[var(--pf-accent)]"
                    aria-hidden
                  />
                ) : null}
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </PendingChromeLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
