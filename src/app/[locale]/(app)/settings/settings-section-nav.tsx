'use client';

import { useTranslations } from 'next-intl';
import { SectionNavLink } from '@/components/ui/section-nav-link';
import { usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  groupSettingsSections,
  type SettingsNavGroup,
  type SettingsSectionKey,
} from './_lib/access';

export interface SettingsNavItem {
  readonly key: SettingsSectionKey;
  readonly href: string;
  readonly group: SettingsNavGroup;
}

export function SettingsSectionNav({
  items,
  activeGroup,
  hideGroupHeaders = false,
}: {
  readonly items: readonly SettingsNavItem[];
  readonly activeGroup?: SettingsNavGroup;
  readonly hideGroupHeaders?: boolean;
}) {
  const tSections = useTranslations('settings.sections');
  const tGroups = useTranslations('settings.groups');
  const tSettings = useTranslations('settings');
  const pathname = usePathname();

  const filtered =
    activeGroup != null ? items.filter((item) => item.group === activeGroup) : items;

  const groups = groupSettingsSections(
    filtered.map((item) => ({
      key: item.key,
      href: item.href,
      permission: null,
      group: item.group,
    })),
  );

  return (
    <nav
      aria-label={tSettings('navLabel')}
      className="-mx-1 flex gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin] lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      <div className="flex gap-1 lg:flex-col lg:gap-0.5">
        {groups.map(({ group, items: groupItems }) => (
          <div key={group} className="flex gap-1 lg:flex-col lg:gap-0.5">
            {!hideGroupHeaders ? (
              <p className="hidden px-3 pb-1 text-xs font-semibold tracking-wide text-[var(--pf-text-secondary)] uppercase lg:block">
                {tGroups(group)}
              </p>
            ) : null}
            {groupItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <SectionNavLink
                  key={item.key}
                  href={item.href}
                  active={active}
                  className={cn(
                    'shrink-0 whitespace-nowrap py-2 text-start',
                    'lg:w-full',
                  )}
                >
                  {tSections(item.key)}
                </SectionNavLink>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
