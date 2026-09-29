'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

/** Visual sales funnel hint — links only; same routes as section nav. */
export function CrmPipelineHint() {
  const t = useTranslations('crm');
  const stepClass =
    'text-xs font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline';

  return (
    <p
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--pf-text-muted)]"
      aria-label={t('pipelineAria')}
    >
      <Link href="/crm/prospects" className={stepClass}>
        {t('nav.prospects')}
      </Link>
      <span aria-hidden className="text-[var(--pf-text-muted)]">
        →
      </span>
      <Link href="/crm/leads" className={stepClass}>
        {t('nav.leads')}
      </Link>
      <span aria-hidden className="text-[var(--pf-text-muted)]">
        →
      </span>
      <Link href="/crm" className={stepClass}>
        {t('nav.opportunities')}
      </Link>
      <span aria-hidden className="text-[var(--pf-text-muted)]">
        →
      </span>
      <Link href="/quotes" className={stepClass}>
        {t('pipeline.quotes')}
      </Link>
    </p>
  );
}
