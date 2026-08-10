'use client';

import { useTranslations } from 'next-intl';
import { ExportDownloadButton } from '@/components/patterns/export-download-button';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export function ActivityExportLink() {
  const t = useTranslations('settings.activity');

  return (
    <ExportDownloadButton
      href="/exports/audit?format=csv"
      variant="ghost"
      size="sm"
      className={cn(textNavLinkClassName, 'min-h-11')}
    >
      {t('exportCsv')}
    </ExportDownloadButton>
  );
}
