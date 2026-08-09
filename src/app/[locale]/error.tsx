'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.errorPage');

  useEffect(() => {
    // Digest only — never echo stacks or internal messages into the browser console.
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'app.error',
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{t('title')}</h1>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('body')}</p>
      <Button variant="secondary" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
