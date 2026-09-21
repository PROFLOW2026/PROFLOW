'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Link } from '@/shared/i18n/navigation';
import { usePathname } from '@/shared/i18n/navigation';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { EmployeeNavItem } from '@/modules/employee-app/application/get-employee-shell';
import {
  employeeMobileNavLabelKey,
  selectEmployeeMobileOverflowItems,
  selectEmployeeMobilePrimaryItems,
} from '@/modules/employee-app/application/employee-navigation';

const EmployeeMobileNavMore = dynamic(
  () =>
    import('./employee-mobile-nav-more').then((mod) => mod.EmployeeMobileNavMore),
  { ssr: false },
);

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

  const moreActive = overflow.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 box-border min-w-0 border-t border-[var(--pf-border)] bg-[var(--pf-surface)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
        aria-label={t('employeeApp.title')}
        data-pf-employee-mobile-nav=""
      >
        <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
          {primary.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href} className="min-w-0 flex-1">
                <Link
                  href={item.href}
                  className={cn(
                    pressableChromeClassName,
                    'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                    active
                      ? 'text-[var(--pf-accent)]'
                      : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                  )}
                >
                  <span className="max-w-full truncate">{t(employeeMobileNavLabelKey(item))}</span>
                </Link>
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
                  'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-medium',
                  moreOpen || moreActive
                    ? 'text-[var(--pf-accent)]'
                    : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)]',
                )}
              >
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
