'use client';

import { useLocale } from 'next-intl';
import * as React from 'react';
import { LOCALE_COOKIE_NAME } from '@/shared/i18n/auth-locale';
import { LOCALES, LOCALE_METADATA, type Locale } from '@/shared/i18n/config';
import { usePathname, useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export interface LocaleSwitcherInlineProps {
  readonly className?: string;
}

/**
 * Pre-auth language selector — cookie + route only (no profile persist).
 */
export function LocaleSwitcherInline({ className }: LocaleSwitcherInlineProps) {
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  return (
    <div
      className={cn('flex flex-wrap items-center justify-center gap-1', className)}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((option) => {
        const active = option === locale;
        return (
          <button
            key={option}
            type="button"
            disabled={pending}
            aria-pressed={active}
            className={cn(
              'rounded-md px-2.5 py-1 text-sm transition-colors',
              active
                ? 'bg-[var(--pf-action-primary)] font-medium text-[var(--pf-action-primary-fg)]'
                : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)] hover:text-[var(--pf-text-primary)]',
            )}
            onClick={() => {
              if (active) return;
              startTransition(() => {
                document.cookie = `${LOCALE_COOKIE_NAME}=${option}; path=/; max-age=31536000; samesite=lax`;
                router.replace(pathname, { locale: option });
              });
            }}
          >
            {LOCALE_METADATA[option].label}
          </button>
        );
      })}
    </div>
  );
}
