'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ExportDownloadButton } from '@/components/patterns/export-download-button';
import { Link } from '@/shared/i18n/navigation';
import type { ReportKind } from '../domain/types';
import { reportDownloadPath, reportPreviewPath } from '../domain/paths';

export function ReportDownloadButtons({
  kind,
  id,
  compact = false,
}: {
  kind: ReportKind;
  id: string;
  compact?: boolean;
}) {
  const t = useTranslations('reports');
  const downloadHref = reportDownloadPath(kind, id);
  const previewHref = reportPreviewPath(kind, id);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <ExportDownloadButton href={downloadHref} variant={compact ? 'ghost' : 'secondary'} size="sm">
        {t('downloadPdf')}
      </ExportDownloadButton>
      <Button asChild variant="ghost" size="sm">
        <Link href={previewHref}>{t('previewPrint')}</Link>
      </Button>
    </div>
  );
}
