'use client';

import { ChevronLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import {
  resolveEmployeeShellHeader,
  shouldUseEmployeeHistoryBack,
} from '@/modules/employee-app/domain/employee-back-navigation';
import { cn } from '@/shared/ui/cn';

export function EmployeeShellHeader() {
  const t = useTranslations('employeeApp');
  const pathname = usePathname();
  const router = useRouter();
  const header = resolveEmployeeShellHeader(pathname);

  if (!header.showHeader) {
    return null;
  }

  const title = header.titleKey ? t(header.titleKey) : t('title');

  function handleBack(): void {
    if (
      typeof window !== 'undefined' &&
      shouldUseEmployeeHistoryBack(document.referrer, window.location.origin)
    ) {
      router.back();
      return;
    }
    router.push(header.fallbackHref);
  }

  return (
    <header className="-mx-4 mb-5 border-b border-[var(--pf-border-default)] bg-[var(--pf-bg-page)] px-4 pb-3 pt-0.5 md:-mx-6 md:px-6">
      <div className="flex items-center gap-2">
        {header.showBack ? (
          <button
            type="button"
            onClick={handleBack}
            className={cn(
              'inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center gap-1 rounded-xl',
              'text-sm font-medium text-[var(--pf-text-primary)]',
              'hover:bg-[var(--pf-bg-subtle)] active:bg-[var(--pf-action-subtle-active)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
            )}
            aria-label={t('back.label')}
          >
            <ChevronLeft className={rtlFlipClassName('size-5 shrink-0')} aria-hidden />
            <span className="hidden sm:inline">{t('back.label')}</span>
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight text-[var(--pf-text-primary)] md:text-xl">
          {title}
        </h1>
      </div>
    </header>
  );
}
