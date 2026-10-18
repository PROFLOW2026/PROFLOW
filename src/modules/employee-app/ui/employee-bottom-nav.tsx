'use client';

import dynamic from 'next/dynamic';
import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { usePathname } from '@/shared/i18n/navigation';
import { PendingChromeLink } from '@/components/ui/pending-chrome-link';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';
import {
  employeeMobileNavIconKey,
  employeeMobileNavLabelKey,
  selectEmployeeMobileOverflowItems,
  selectEmployeeMobilePrimaryItems,
} from '@/modules/employee-app/application/employee-navigation';
import { EmployeeNavIcon } from './employee-nav-icon';

const EmployeeMobileNavMore = dynamic(
  () =>
    import('./employee-mobile-nav-more').then((mod) => mod.EmployeeMobileNavMore),
  { ssr: false },
);

function isNavActive(pathname: string, href: string): boolean {
  return href === '/employee'
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function EmployeeBottomNav({ items }: { items: readonly EmployeeNavItem[] }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreMounted, setMoreMounted] = useState(false);

  const primary = selectEmployeeMobilePrimaryItems(items);
  const overflow = selectEmployeeMobileOverflowItems(items);

  function openMore() {
    setMoreMounted(true);
    setMoreOpen(true);
  }

  const moreActive = overflow.some((item) => isNavActive(pathname, item.href));

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 box-border w-full min-w-0 max-w-full border-t border-[var(--pf-border-default)] bg-[color-mix(in_srgb,var(--pf-bg-surface)_94%,transparent)] pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden print:hidden supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--pf-bg-surface)_88%,transparent)]"
        aria-label={t('employeeApp.title')}
        data-pf-employee-mobile-nav=""
      >
        <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
          {primary.map((item) => {
            const active = isNavActive(pathname, item.href);
            const iconKey = employeeMobileNavIconKey(item);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <PendingChromeLink
                  href={item.href}
                  active={active}
                  className={cn(
                    'relative flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                    active
                      ? 'text-[var(--pf-accent)]'
                      : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                  )}
                  icon={iconKey ? <EmployeeNavIcon iconKey={iconKey} className="size-5" /> : undefined}
                >
                  {active ? (
                    <span
                      className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-[var(--pf-accent)]"
                      aria-hidden
                    />
                  ) : null}
                  <span className="max-w-full truncate">{t(employeeMobileNavLabelKey(item))}</span>
                </PendingChromeLink>
              </li>
            );
          })}

          {overflow.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={openMore}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-controls="pf-employee-mobile-nav-more"
                data-pf-employee-mobile-nav-more=""
                className={cn(
                  pressableChromeClassName,
                  'relative flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                  moreOpen || moreActive
                    ? 'text-[var(--pf-accent)]'
                    : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                )}
              >
                {moreOpen || moreActive ? (
                  <span
                    className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-[var(--pf-accent)]"
                    aria-hidden
                  />
                ) : null}
                <MoreHorizontal className="size-5" aria-hidden />
                <span className="max-w-full truncate">{t('employeeApp.nav.more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {moreMounted ? (
        <EmployeeMobileNavMore
          open={moreOpen}
          onOpenChange={setMoreOpen}
          items={overflow}
          pathname={pathname}
        />
      ) : null}
    </>
  );
}
