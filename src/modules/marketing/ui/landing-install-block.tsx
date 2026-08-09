'use client';

import { useTranslations } from 'next-intl';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import { usePwaInstall } from '@/modules/offline/ui/use-pwa-install';

/**
 * Shows the install heading + shared PWA CTA only when install is available.
 * Hidden when already installed / standalone / unsupported.
 */
export function LandingInstallBlock() {
  const t = useTranslations('marketing.mobile');
  const { capability } = usePwaInstall();

  if (capability === 'installed' || capability === 'unavailable') {
    return null;
  }

  return (
    <div className="mt-6 rounded-md border border-[color-mix(in_srgb,var(--pf-teal-600)_35%,var(--pf-border-default))] bg-[color-mix(in_srgb,var(--pf-teal-50)_80%,white)] p-4">
      <h3 className="text-base font-bold text-[var(--pf-text-brand)]">{t('installHeading')}</h3>
      <div className="mt-3">
        <PwaInstallCta variant="marketing" />
      </div>
    </div>
  );
}
