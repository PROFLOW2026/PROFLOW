'use client';

import { useTranslations } from 'next-intl';
import { ExportDownloadButton } from '@/components/patterns/export-download-button';

export function ActivityExportLink() {
  const t = useTranslations('settings.activity');

  return (
    <ExportDownloadButton
      href="/exports/audit?format=csv"
      variant="ghost"
      size="sm"
      className="min-h-11 text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
    >
      {t('exportCsv')}
    </ExportDownloadButton>
  );
}
