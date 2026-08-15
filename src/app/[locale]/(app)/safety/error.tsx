'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export default function SafetyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('safety');
  const tErrors = useTranslations('errors.errorPage');

  useEffect(() => {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'safety.error',
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h1 className="text-xl font-semibold">{t('error')}</h1>
      <Button variant="secondary" onClick={reset}>
        {tErrors('retry')}
      </Button>
    </div>
  );
}
