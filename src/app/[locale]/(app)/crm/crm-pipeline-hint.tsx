'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';

/** Compact next-step hint. Prospects, leads, and opportunities stay in CrmSectionNav. */
export function CrmPipelineHint() {
  const t = useTranslations('crm');

  return (
    <p className="min-w-0 text-xs text-[var(--pf-text-muted)]" aria-label={t('pipelineAria')}>
      <Link
        href="/quotes"
        className="font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
      >
        {t('pipeline.quotes')}
      </Link>
    </p>
  );
}
