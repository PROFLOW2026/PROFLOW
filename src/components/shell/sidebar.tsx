'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { isNavItemActive, type NavItem } from './navigation';
import { NavIcon } from './nav-icon';

export interface SidebarProps {
  items: NavItem[];
  organizationName: string;
  footer?: React.ReactNode;
}

/**
 * Desktop navigation. The rail sits on the inline-start edge, so it lands on
 * the right in Hebrew and the left in English without a second layout.
 */
export function Sidebar({ items, organizationName, footer }: SidebarProps) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const pathname = usePathname();

  return (
    <nav
      aria-label={tCommon('a11y.mainNavigation')}
      className="hidden w-[var(--pf-sidebar-width)] shrink-0 flex-col border-e border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] lg:flex"
    >
      <div className="flex h-[var(--pf-topbar-height)] items-center gap-2 border-b border-[var(--pf-border-default)] px-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-xs font-bold text-[var(--pf-action-primary-fg)]">
          PF
        </span>
        <span className="min-w-0 truncate text-sm font-semibold" title={organizationName}>
          {organizationName}
        </span>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);

          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--pf-teal-50)] text-[var(--pf-text-brand)]'
                    : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
                )}
              >
                <NavIcon iconKey={item.iconKey} className="size-4.5 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {footer ? <div className="border-t border-[var(--pf-border-default)] p-2">{footer}</div> : null}
    </nav>
  );
}
