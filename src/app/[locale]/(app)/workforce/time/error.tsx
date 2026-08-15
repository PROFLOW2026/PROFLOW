'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function TimeEntriesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.errorPage');

  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'workforce.time.error',
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('body')}</p>
      <Button variant="secondary" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
