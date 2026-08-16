'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePwaInstall } from './use-pwa-install';

export function PwaInstallPanel() {
  const t = useTranslations('offline.install');
  const { capability, installing, promptOutcome, promptInstall } = usePwaInstall();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('subtitle')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {capability === 'installed' ? (
          <p className="text-sm text-[var(--pf-text-primary)]" role="status">
            {promptOutcome === 'accepted' ? t('outcomeAccepted') : t('installed')}
          </p>
        ) : null}

        {capability === 'prompt_available' ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('promptHint')}</p>
            <Button
              type="button"
              variant="primary"
              loading={installing}
              onClick={() => {
                void promptInstall();
              }}
            >
              {installing ? t('installing') : t('installCta')}
            </Button>
          </div>
        ) : null}

        {capability === 'manual_ios' ? (
          <ol className="list-decimal space-y-2 ps-5 text-sm text-[var(--pf-text-primary)]">
            <li>{t('iosStepShare')}</li>
            <li>{t('iosStepAdd')}</li>
            <li>{t('iosStepConfirm')}</li>
          </ol>
        ) : null}

        {/* After dismiss, capability falls back to unavailable - keep one message. */}
        {capability === 'unavailable' && promptOutcome !== 'dismissed' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('unavailable')}</p>
        ) : null}

        {promptOutcome === 'dismissed' ? (
          <p className="text-sm text-[var(--pf-text-secondary)]" role="status">
            {t('outcomeDismissed')}
          </p>
        ) : null}
        {promptOutcome === 'error' ? (
          <p className="text-sm text-[var(--pf-status-danger-fg)]" role="alert">
            {t('outcomeError')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
