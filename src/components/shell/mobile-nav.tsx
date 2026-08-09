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
        className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="flex items-stretch">
          {primary.map((item) => {
            const active = isNavItemActive(pathname, item.href);

            return (
              <li key={item.key} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium',
                    active ? 'text-[var(--pf-text-brand)]' : 'text-[var(--pf-text-secondary)]',
                  )}
                >
                  <NavIcon iconKey={item.iconKey} className="size-5" />
                  <span className="max-w-full truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            );
          })}

          {overflow.length > 0 ? (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className="flex h-16 w-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] font-medium text-[var(--pf-text-secondary)]"
              >
                <MoreHorizontal className="size-5" aria-hidden />
                <span>{t('more')}</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent closeLabel={tCommon('actions.close')}>
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
                      className="flex items-center gap-3 rounded-md px-2 py-3 text-sm hover:bg-[var(--pf-bg-muted)]"
                    >
                      <NavIcon iconKey={item.iconKey} className="size-5 text-[var(--pf-text-muted)]" />
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
