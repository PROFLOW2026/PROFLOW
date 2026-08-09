'use client';

import { useTranslations } from 'next-intl';
import { ExportDownloadButton } from '@/components/patterns/export-download-button';

export function ProjectFinancialsExportLink({ projectId }: { projectId: string }) {
  const t = useTranslations('financial');

  return (
    <ExportDownloadButton
      href={`/exports/project-financials?projectId=${encodeURIComponent(projectId)}`}
      variant="link"
      size="sm"
      className="min-h-11 px-0 underline underline-offset-2"
    >
      {t('exportCsv')}
    </ExportDownloadButton>
  );
}
