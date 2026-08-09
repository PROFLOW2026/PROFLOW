'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { SettingsSectionKey } from './_lib/access';

export interface SettingsNavItem {
  readonly key: SettingsSectionKey;
  readonly href: string;
}

export function SettingsSectionNav({ items }: { items: readonly SettingsNavItem[] }) {
  const tSections = useTranslations('settings.sections');
  const tSettings = useTranslations('settings');
  const pathname = usePathname();

  return (
    <nav
      aria-label={tSettings('navLabel')}
      className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0"
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 shrink-0 items-center rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
              active
                ? 'bg-[var(--pf-teal-50)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {tSections(item.key)}
          </Link>
        );
      })}
    </nav>
  );
}
