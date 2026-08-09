'use client';

import { MoreHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { isNavItemActive, type NavItem } from './navigation';
import { NavIcon } from './nav-icon';

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

  const primary = items.filter((item) => item.primaryOnMobile).slice(0, 4);
  const overflow = items.filter((item) => !primary.includes(item));

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
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                    active ? 'text-[var(--pf-text-brand)]' : 'text-[var(--pf-text-secondary)]',
                  )}
                >
                  <NavIcon iconKey={item.iconKey} className="size-5 shrink-0" />
                  <span className="max-w-full truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}

          {overflow.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                aria-haspopup="dialog"
                aria-controls="pf-mobile-nav-more"
                className={cn(
                  'flex h-[var(--pf-bottomnav-height)] w-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium text-[var(--pf-text-secondary)]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
                )}
              >
                <MoreHorizontal className="size-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{t('more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent
          id="pf-mobile-nav-more"
          closeLabel={tCommon('actions.close')}
          aria-describedby={undefined}
        >
          <DialogHeader>
            <DialogTitle>{t('more')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <ul className="flex flex-col">
              {overflow.map((item) => {
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className="flex min-h-11 items-center gap-3 rounded-md px-2 py-3 text-sm hover:bg-[var(--pf-bg-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                    >
                      <NavIcon
                        iconKey={item.iconKey}
                        className="size-5 text-[var(--pf-text-muted)]"
                      />
                      {t(item.labelKey)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}
