'use client';

import { Download, Share } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';
import { usePwaInstall } from './use-pwa-install';

export type PwaInstallCtaVariant = 'auth' | 'dashboard' | 'inline' | 'marketing';

/**
 * Discoverable install CTA for public auth + authenticated home.
 * Hidden when already installed / standalone.
 * Android Chromium: one-tap native prompt when BIP is held.
 * iOS: instructions only — never a fake direct-install button.
 * Unsupported / waiting for BIP: render nothing (avoid false "unavailable").
 */
export function PwaInstallCta({
  variant = 'inline',
  className,
}: {
  variant?: PwaInstallCtaVariant;
  className?: string;
}) {
  const t = useTranslations('offline.install');
  const { capability, installing, promptOutcome, promptInstall } = usePwaInstall();
  const [iosOpen, setIosOpen] = React.useState(false);

  if (capability === 'installed') return null;

  const ctaLabel = installing
    ? t('installing')
    : variant === 'marketing'
      ? t('shortCta')
      : null;

  if (capability === 'prompt_available') {
    return (
      <div
        className={cn(shellClass(variant), className)}
        data-pf-pwa-install-cta={variant}
        data-pf-pwa-capability="prompt_available"
      >
        {variant === 'dashboard' ? (
          <p className="min-w-0 flex-1 text-sm text-[var(--pf-text-secondary)]">{t('dashboardHint')}</p>
        ) : null}
        <Button
          type="button"
          variant={variant === 'auth' || variant === 'marketing' ? 'secondary' : 'primary'}
          size={variant === 'marketing' ? 'md' : 'sm'}
          className="min-h-11 w-full sm:w-auto"
          loading={installing}
          aria-busy={installing || undefined}
          onClick={() => {
            void promptInstall();
          }}
        >
          <Download className="size-4 shrink-0" aria-hidden />
          {ctaLabel ?? (installing ? t('installing') : t('shortCta'))}
        </Button>
        {promptOutcome === 'dismissed' ? (
          <p className="w-full text-xs text-[var(--pf-text-secondary)]" role="status">
            {t('outcomeDismissed')}
          </p>
        ) : null}
        {promptOutcome === 'error' ? (
          <p className="w-full text-xs text-[var(--pf-status-danger-fg)]" role="alert">
            {t('outcomeError')}
          </p>
        ) : null}
      </div>
    );
  }

  if (capability === 'manual_ios') {
    return (
      <div
        className={cn(shellClass(variant), className)}
        data-pf-pwa-install-cta={variant}
        data-pf-pwa-capability="manual_ios"
      >
        <Button
          type="button"
          variant="secondary"
          size={variant === 'marketing' ? 'md' : 'sm'}
          className="min-h-11 w-full sm:w-auto"
          aria-expanded={iosOpen}
          onClick={() => setIosOpen((open) => !open)}
        >
          <Share className="size-4 shrink-0" aria-hidden />
          {variant === 'marketing' ? t('shortCta') : t('iosCta')}
        </Button>
        {iosOpen ? (
          <ol className="w-full list-decimal space-y-1 ps-5 text-start text-sm text-[var(--pf-text-primary)]">
            <li>{t('iosStepShare')}</li>
            <li>{t('iosStepAdd')}</li>
            <li>{t('iosStepConfirm')}</li>
          </ol>
        ) : null}
      </div>
    );
  }

  // `unavailable` — waiting for BIP or unsupported browser: do not claim install is impossible.
  return null;
}

function shellClass(variant: PwaInstallCtaVariant): string {
  if (variant === 'auth') {
    return 'mt-6 flex w-full max-w-sm flex-col items-stretch gap-2';
  }
  if (variant === 'dashboard') {
    return cn(
      'flex min-w-0 max-w-full flex-col gap-3 rounded-lg border border-[var(--pf-border-default)]',
      'bg-[var(--pf-bg-surface)] p-3 sm:flex-row sm:items-center sm:justify-between',
    );
  }
  if (variant === 'marketing') {
    return 'flex min-w-0 w-full max-w-sm flex-col items-stretch gap-2';
  }
  return 'flex min-w-0 flex-col gap-2';
}
