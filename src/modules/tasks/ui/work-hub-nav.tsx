'use client';

import { useMemo } from 'react';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { pressableClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { WORK_TASK_QUERY_KEYS } from '@/modules/tasks/domain/work-task-filter-keys';

const WORK_HUB_ROUTES = [
  { path: '/work', labelKey: 'myWork' as const },
  { path: '/work/board', labelKey: 'taskBoard' as const },
  { path: '/work/calendar', labelKey: 'taskCalendar' as const },
  { path: '/work/timeline', labelKey: 'taskTimeline' as const },
  { path: '/work/insights', labelKey: 'taskInsights' as const },
] as const;

function compactWorkSearchParams(searchParams: ReadonlyURLSearchParams): string {
  const out = new URLSearchParams();
  for (const key of WORK_TASK_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value?.trim()) out.set(key, value.trim());
  }
  const query = out.toString();
  return query ? `?${query}` : '';
}

export function WorkHubNav() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const querySuffix = useMemo(
    () => compactWorkSearchParams(searchParams),
    [searchParams],
  );

  return (
    <nav
      aria-label={t('myWork')}
      className={cn(
        'flex min-w-0 max-w-full items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-[var(--pf-border-default)]',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
      )}
    >
      {WORK_HUB_ROUTES.map(({ path, labelKey }) => {
        const selected =
          path === '/work'
            ? pathname === '/work' || pathname === '/work/'
            : pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link
            key={path}
            href={`${path}${querySuffix}`}
            scroll={false}
            prefetch={false}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'relative shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium',
              'min-h-11',
              pressableClassName,
              selected
                ? 'border-[var(--pf-action-primary)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {t(labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
