'use client';

import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';
import {
  isNavItemActive,
  type MoreNavGroup,
  type NavItem,
} from './navigation';
import { ShellNavLink } from './shell-nav-link';
import {
  findActiveNavGroup,
  nextExclusiveOpenGroup,
  type NavAccordionGroup,
} from './nav-accordion-state';

export type { NavAccordionGroup } from './nav-accordion-state';

/**
 * Exclusive accordion for experience nav groups.
 * Collapsed by default; opens the group that owns the active route on load/deep link.
 */
export function useExclusiveNavAccordion(
  groups: readonly NavAccordionGroup[],
  pathname: string,
): {
  openGroup: MoreNavGroup | null;
  toggleGroup: (group: MoreNavGroup) => void;
} {
  const activeGroup = React.useMemo(
    () => findActiveNavGroup(groups, pathname, isNavItemActive),
    [groups, pathname],
  );

  // When pathname changes, drop the user override and follow the active route group.
  const [override, setOverride] = React.useState<{
    path: string;
    group: MoreNavGroup | null;
  } | null>(null);

  const openGroup =
    override && override.path === pathname ? override.group : activeGroup;

  const toggleGroup = React.useCallback(
    (group: MoreNavGroup) => {
      setOverride({
        path: pathname,
        group: nextExclusiveOpenGroup(openGroup, group),
      });
    },
    [openGroup, pathname],
  );

  return { openGroup, toggleGroup };
}

export function NavAccordionSections({
  groups,
  pathname,
  groupLabel,
  itemLabel,
  expandLabel,
  collapseLabel,
  onNavigate,
  linkVariant = 'sidebar',
  muteIcon,
  linkClassName,
}: {
  groups: readonly NavAccordionGroup[];
  pathname: string;
  groupLabel: (group: MoreNavGroup) => string;
  itemLabel: (item: NavItem) => string;
  expandLabel: string;
  collapseLabel: string;
  onNavigate?: () => void;
  linkVariant?: 'sidebar' | 'mobile';
  muteIcon?: boolean;
  linkClassName?: string;
}) {
  const { openGroup, toggleGroup } = useExclusiveNavAccordion(groups, pathname);

  return (
    <div className="flex flex-col gap-1">
      {groups.map(({ group, items }) => {
        const expanded = openGroup === group;
        const panelId = `pf-nav-group-${group}`;
        const hasActiveChild = items.some((item) => isNavItemActive(pathname, item.href));

        return (
          <div key={group} className="min-w-0">
            <button
              type="button"
              className={cn(
                'flex w-full min-h-10 items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-xs font-semibold tracking-wide text-[var(--pf-text-secondary)] transition-colors hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
                (expanded || hasActiveChild) && 'text-[var(--pf-text-primary)]',
                hasActiveChild && !expanded && 'bg-[var(--pf-bg-muted)]/60',
              )}
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggleGroup(group)}
            >
              <span className="min-w-0 truncate">{groupLabel(group)}</span>
              <span className="inline-flex items-center gap-1">
                <span className="sr-only">{expanded ? collapseLabel : expandLabel}</span>
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 transition-transform duration-150',
                    expanded && 'rotate-180',
                  )}
                  aria-hidden
                />
              </span>
            </button>

            <div id={panelId} role="region" hidden={!expanded}>
              <ul className="flex flex-col gap-0.5 pb-1">
                {items.map((item) => {
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <li key={item.key}>
                      <ShellNavLink
                        href={item.href}
                        label={itemLabel(item)}
                        iconKey={item.iconKey}
                        active={active}
                        variant={linkVariant}
                        muteIcon={muteIcon}
                        onNavigate={onNavigate}
                        className={linkClassName}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
