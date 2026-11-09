'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableClassName } from '@/components/ui/pressable';

export function TodayDecisionsLensToggle() {
  const t = useTranslations('commandCenter');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get('lens') === 'decisions';

  return (
    <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('decisionsLens.label')}>
      <button
        type="button"
        aria-pressed={!active}
        className={cn(
          pressableClassName,
          'rounded-lg border px-3 py-1.5 text-sm font-medium',
          !active
            ? 'border-[var(--pf-text-brand)] bg-[var(--pf-bg-muted)]'
            : 'border-[var(--pf-border-default)]',
        )}
        onClick={() => router.replace(pathname)}
      >
        {t('decisionsLens.all')}
      </button>
      <button
        type="button"
        aria-pressed={active}
        className={cn(
          pressableClassName,
          'rounded-lg border px-3 py-1.5 text-sm font-medium',
          active
            ? 'border-[var(--pf-text-brand)] bg-[var(--pf-bg-muted)]'
            : 'border-[var(--pf-border-default)]',
        )}
        onClick={() => router.replace(`${pathname}?lens=decisions`)}
      >
        {t('decisionsLens.decisionsOnly')}
      </button>
    </div>
  );
}
