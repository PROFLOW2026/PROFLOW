'use client';

import { MoreHorizontal } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Spinner } from '@/components/ui/spinner';
import { usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  isNavItemActive,
  type NavItem,
} from './navigation';
import { ShellNavLink } from './shell-nav-link';

const MobileNavMore = dynamic(
  () => import('./mobile-nav-more').then((mod) => mod.MobileNavMore),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        data-pf-mobile-nav-more-loading=""
        className="fixed inset-0 z-60 flex items-end justify-center bg-[rgb(27_36_48/0.45)] sm:items-center"
      >
        <div className="flex w-full max-w-lg items-center justify-center gap-2 rounded-t-xl bg-[var(--pf-bg-elevated)] px-5 py-8 shadow-[var(--pf-shadow-lg)] sm:rounded-lg">
          <Spinner className="size-5" />
        </div>
      </div>
    ),
  },
);

/**
 * Mobile bottom navigation (doc 62).
 *
 * At most four destinations plus "More": a phone bar with nine icons is a
 * compressed desktop sidebar, which is exactly what V1 must not ship.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  /** Keep the lazy sheet mounted after first open so reopen is instant. */
  const [moreMounted, setMoreMounted] = React.useState(false);

  const primary = items.filter((item) => item.primaryOnMobile).slice(0, 4);
  const overflow = items.filter((item) => !primary.includes(item));

  function openMore() {
    setMoreMounted(true);
    setMoreOpen(true);
  }

  return (
    <>
      <nav
        aria-label={tCommon('a11y.mainNavigation')}
        data-pf-mobile-nav=""
        className="fixed inset-x-0 bottom-0 z-20 flex w-full max-w-full border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      >
        <ul className="flex w-full min-w-0 items-stretch">
          {primary.map((item) => {
            const active = isNavItemActive(pathname, item.href);

            return (
              <li key={item.key} className="min-w-0 flex-1">
                <ShellNavLink
                  href={item.href}
                  label={t(item.labelKey)}
                  iconKey={item.iconKey}
                  active={active}
                  variant="mobile"
                />
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
                aria-controls="pf-mobile-nav-more"
                data-pf-mobile-nav-more=""
                className={cn(
                  'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                  moreOpen
                    ? 'text-[var(--pf-text-brand)]'
                    : 'text-[var(--pf-text-secondary)] active:text-[var(--pf-text-primary)]',
                )}
              >
                <MoreHorizontal className="size-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{t('more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {moreMounted ? (
        <MobileNavMore
          open={moreOpen}
          onOpenChange={setMoreOpen}
          items={overflow}
          pathname={pathname}
        />
      ) : null}
    </>
  );
}
