'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { pressableChromeClassName } from '@/components/ui/pressable';
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
      className="fixed inset-x-0 bottom-0 z-40 box-border min-w-0 border-t border-[var(--pf-border)] bg-[var(--pf-surface)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden print:hidden"
      aria-label={t('shell.navLabel')}
      data-pf-contractor-mobile-nav=""
    >
      <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
        {items.map((item) => {
          const active = item.key === activeTab;
          const iconKey = contractorMobileTabIconKey(item.key as Parameters<typeof contractorMobileTabIconKey>[0]);
          return (
            <li key={item.key} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  pressableChromeClassName,
                  'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                  active
                    ? 'text-[var(--pf-accent)]'
                    : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                )}
              >
                <PortalNavIcon navKey={iconKey} className="size-5" />
                <span className="max-w-full truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
