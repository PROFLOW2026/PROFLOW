'use client';

import { MoreHorizontal } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { Spinner } from '@/components/ui/spinner';
import { pressableChromeClassName } from '@/components/ui/pressable';
import { usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  isNavItemActive,
  selectMobilePrimaryItems,
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

const mobileNavPositionStyle: React.CSSProperties = {
  bottom: 'var(--pf-visual-viewport-bottom-offset, 0px)',
  left: 'var(--pf-visual-viewport-offset-left, 0px)',
  width: 'var(--pf-visual-viewport-width, 100%)',
  maxWidth: 'var(--pf-visual-viewport-width, 100%)',
};

/**
 * Mobile bottom navigation (doc 62).
 *
 * Portaled to `document.body`. Width/left track visualViewport (RTL-safe);
 * bottom tracks visual viewport + measured safety inset.
 */
export function MobileNav({
  items,
  moreFooter,
}: {
  items: NavItem[];
  moreFooter?: React.ReactNode;
}) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  /** Keep the lazy sheet mounted after first open so reopen is instant. */
  const [moreMounted, setMoreMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const primary = selectMobilePrimaryItems(items);
  const overflow = items.filter((item) => !primary.includes(item));

  function openMore() {
    setMoreMounted(true);
    setMoreOpen(true);
  }

  const navBar = (
    <nav
      aria-label={tCommon('a11y.mainNavigation')}
      data-pf-mobile-nav=""
      className={cn(
        'fixed z-40 box-border flex min-w-0 flex-col border-t border-[var(--pf-border-default)]',
        'bg-[var(--pf-bg-surface)] pb-[env(safe-area-inset-bottom,0px)] print:hidden lg:hidden',
      )}
      style={mobileNavPositionStyle}
    >
      <ul className="flex h-[var(--pf-bottomnav-height)] w-full min-w-0 items-stretch">
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
                pressableChromeClassName,
                'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                moreOpen
                  ? 'text-[var(--pf-text-brand)]'
                  : 'text-[var(--pf-text-secondary)] active:bg-[var(--pf-action-subtle-active)] active:text-[var(--pf-text-primary)]',
              )}
            >
              <MoreHorizontal className="size-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate">{t('more')}</span>
            </button>
          </li>
        ) : null}
      </ul>
    </nav>
  );

  return (
    <>
      {mounted && typeof document !== 'undefined' ? createPortal(navBar, document.body) : null}

      {moreMounted ? (
        <MobileNavMore
          open={moreOpen}
          onOpenChange={setMoreOpen}
          items={overflow}
          pathname={pathname}
          footer={moreFooter}
        />
      ) : null}
    </>
  );
}
