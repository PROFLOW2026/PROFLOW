'use client';

import { useMemo } from 'react';
import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { pressableClassName } from '@/components/ui/pressable';
import { Link, usePathname } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { WORK_TASK_QUERY_KEYS } from '@/modules/tasks/domain/work-task-filter-keys';

const WORK_HUB_ROUTES = [
  { path: '/work', labelKey: 'myWork' as const, labelNs: 'nav' as const },
  { path: '/work/list', labelKey: 'pageTitle' as const, labelNs: 'tasks.list' as const },
  { path: '/work/board', labelKey: 'taskBoard' as const, labelNs: 'nav' as const },
  { path: '/work/calendar', labelKey: 'taskCalendar' as const, labelNs: 'nav' as const },
  { path: '/work/timeline', labelKey: 'taskTimeline' as const, labelNs: 'nav' as const },
  { path: '/work/insights', labelKey: 'taskInsights' as const, labelNs: 'nav' as const },
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
  const tNav = useTranslations('nav');
  const tTasksList = useTranslations('tasks.list');
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const querySuffix = useMemo(
    () => compactWorkSearchParams(searchParams),
    [searchParams],
  );

  return (
    <nav
      aria-label={tNav('myWork')}
      className={cn(
        'flex min-w-0 max-w-full flex-wrap gap-1 border-b border-[var(--pf-border-default)] pb-1',
      )}
    >
      {WORK_HUB_ROUTES.map(({ path, labelKey, labelNs }) => {
        const label = labelNs === 'tasks.list' ? tTasksList('pageTitle') : tNav(labelKey);
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
              'relative min-w-0 flex-1 basis-[calc(50%-0.25rem)] border-b-2 border-transparent px-2 py-2 text-center text-sm font-medium sm:basis-auto sm:flex-none sm:px-3 sm:py-2.5',
              'min-h-11 sm:whitespace-nowrap',
              pressableClassName,
              selected
                ? 'border-[var(--pf-action-primary)] text-[var(--pf-text-brand)]'
                : 'text-[var(--pf-text-secondary)] hover:text-[var(--pf-text-primary)]',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
