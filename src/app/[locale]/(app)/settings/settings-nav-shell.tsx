'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { usePathname } from '@/shared/i18n/navigation';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import {
  SETTINGS_NAV_GROUP_ORDER,
  type SettingsNavGroup,
  type SettingsSectionKey,
} from './_lib/access';
import { SettingsSectionNav, type SettingsNavItem } from './settings-section-nav';

function normalizePath(pathname: string): string {
  return pathname.replace(/^\/[a-z]{2}(-[A-Z]{2})?(?=\/|$)/, '') || '/';
}

function resolveGroupFromPath(pathname: string, items: readonly SettingsNavItem[]): SettingsNavGroup {
  const path = normalizePath(pathname);
  const match = items.find(
    (item) => path === item.href || path.startsWith(`${item.href}/`),
  );
  return match?.group ?? items[0]?.group ?? 'myBusiness';
}

function firstHrefInGroup(items: readonly SettingsNavItem[], group: SettingsNavGroup): string {
  return items.find((item) => item.group === group)?.href ?? '/settings';
}

export function SettingsNavShell({ items }: { readonly items: readonly SettingsNavItem[] }) {
  const pathname = usePathname();
  const tGroups = useTranslations('settings.groups');
  const tSettings = useTranslations('settings');

  const groupsPresent = useMemo(() => {
    const set = new Set<SettingsNavGroup>();
    for (const item of items) set.add(item.group);
    return SETTINGS_NAV_GROUP_ORDER.filter((g) => set.has(g));
  }, [items]);

  const activeGroup = resolveGroupFromPath(pathname, items);
  const sectionItems = items.filter((item) => item.group === activeGroup);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link
          href="/settings"
          className="text-xs font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
        >
          {tSettings('hub.backToGroups')}
        </Link>
        <div
          className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]"
          role="tablist"
          aria-label={tSettings('hub.groupSwitcherLabel')}
        >
          {groupsPresent.map((group) => {
            const active = group === activeGroup;
            return (
              <Link
                key={group}
                href={firstHrefInGroup(items, group)}
                role="tab"
                aria-selected={active}
                className={cn(
                  'shrink-0 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap',
                  active
                    ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]'
                    : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-subtle)]',
                )}
              >
                {tGroups(group)}
              </Link>
            );
          })}
        </div>
      </div>
      <SettingsSectionNav items={sectionItems} activeGroup={activeGroup} hideGroupHeaders />
    </div>
  );
}

export function SettingsGroupHub({
  groups,
}: {
  readonly groups: readonly {
    group: SettingsNavGroup;
    href: string;
    sectionKeys: readonly SettingsSectionKey[];
  }[];
}) {
  const tGroups = useTranslations('settings.groups');
  const tHub = useTranslations('settings.hub');
  const tSections = useTranslations('settings.sections');

  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map(({ group, href, sectionKeys }) => (
        <Link
          key={group}
          href={href}
          className={cn(pressableCardLinkClassName, 'flex min-w-0 flex-col gap-2 p-4 text-start')}
        >
          <p className="font-semibold">{tGroups(group)}</p>
          <p className="text-xs text-[var(--pf-text-secondary)]">{tHub(`groupHint.${group}`)}</p>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-[var(--pf-text-muted)]">
            {sectionKeys.slice(0, 4).map((key) => (
              <li key={key}>{tSections(key)}</li>
            ))}
            {sectionKeys.length > 4 ? (
              <li>{tHub('andMore', { count: sectionKeys.length - 4 })}</li>
            ) : null}
          </ul>
        </Link>
      ))}
    </div>
  );
}
