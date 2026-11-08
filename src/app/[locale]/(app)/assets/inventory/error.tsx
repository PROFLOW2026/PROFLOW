'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { rethrowIfPageAuthorization } from '@/shared/errors/page-authorization';

export default function InventoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.errorPage');

  useEffect(() => {
    console.error('[inventory-error]', error.digest ?? error.message);
  }, [error]);

  rethrowIfPageAuthorization(error);
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