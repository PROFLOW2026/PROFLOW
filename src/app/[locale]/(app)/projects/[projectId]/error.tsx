'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

/**
 * Isolates a tab-panel failure so project chrome (header + hubs) stays usable.
 * A bad optional field on Overview must not wipe Financials / Work / Details.
 */
export default function ProjectWorkspaceError({
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
        event: 'project.workspace.error',
        digest: error.digest ?? null,
      }),
    );
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 py-8">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('body')}</p>
      <Button variant="secondary" onClick={reset}>
        {t('retry')}
      </Button>
    </div>
  );
}
