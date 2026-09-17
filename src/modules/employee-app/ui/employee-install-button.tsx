'use client';

import { useTranslations } from 'next-intl';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';

/** Compact install control — same ProjectFlow PWA flow as the Owner app. */
export function EmployeeInstallButton() {
  const t = useTranslations('employeeApp.home');
  return <PwaInstallCta variant="inline" ctaLabel={t('installApp')} className="items-start" />;
}
