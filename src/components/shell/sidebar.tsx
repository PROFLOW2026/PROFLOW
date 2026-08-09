'use client';

import { useTranslations } from 'next-intl';
import type * as React from 'react';
import { usePathname } from '@/shared/i18n/navigation';
import { isNavItemActive, type NavItem } from './navigation';
import { ShellNavLink } from './shell-nav-link';

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
              <ShellNavLink
                href={item.href}
                label={t(item.labelKey)}
                iconKey={item.iconKey}
                active={active}
                variant="sidebar"
              />
            </li>
          );
        })}
      </ul>

      {footer ? <div className="border-t border-[var(--pf-border-default)] p-2">{footer}</div> : null}
    </nav>
  );
}
