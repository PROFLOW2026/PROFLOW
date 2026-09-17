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
    <header className="sticky top-0 z-30 -mx-4 mb-4 border-b border-[var(--pf-border)] bg-[var(--pf-bg)]/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-[var(--pf-bg)]/80">
      <div className="flex items-center gap-2">
        {header.showBack ? (
          <button
            type="button"
            onClick={handleBack}
            className={cn(
              'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg',
              'text-sm font-medium text-[var(--pf-text-primary)]',
              'hover:bg-[var(--pf-bg-surface)] active:bg-[var(--pf-bg-surface)]',
            )}
            aria-label={t('back.label')}
          >
            <ChevronLeft className={rtlFlipClassName('size-5 shrink-0')} aria-hidden />
            <span>{t('back.label')}</span>
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      </div>
    </header>
  );
}
