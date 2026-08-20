'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Link } from '@/shared/i18n/navigation';

/**
 * Shown when a permitted deep link lands inside a capability hidden from nav.
 * Hidden ≠ forbidden — explains restore path without blocking the record.
 */
export function HiddenCapabilityBanner({
  moduleLabel,
}: {
  readonly moduleLabel: string;
}) {
  const t = useTranslations('nav.hiddenCapability');

  return (
    <Alert tone="info" className="mb-4" role="status">
      <p className="font-medium">{t('title', { module: moduleLabel })}</p>
      <p className="mt-1 text-sm">
        {t.rich('body', {
          settings: (chunks) => (
            <Link href="/settings/features" className="underline underline-offset-2">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </Alert>
  );
}
