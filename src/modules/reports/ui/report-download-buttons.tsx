'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { SaveToStorageButton } from '@/modules/generated-documents/ui/save-to-storage-button';
import { supportsGeneratedStorageSave } from '@/modules/generated-documents/domain/supported-kinds';
import type { ReportKind } from '../domain/types';
import { reportPreviewPath } from '../domain/paths';

export function ReportDownloadButtons({
  kind,
  id,
  compact = false,
  reportMonth,
  hidePreview = false,
}: {
  kind: ReportKind;
  id: string;
  compact?: boolean;
  reportMonth?: string;
  hidePreview?: boolean;
}) {
  const t = useTranslations('reports');
  const previewHref = reportPreviewPath(kind, id);
  const kindLabel = t(`kinds.${kind}`);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {!hidePreview ? (
        <Button asChild variant={compact ? 'ghost' : 'secondary'} size="sm">
          <Link href={previewHref}>{t('previewKindPrint', { kind: kindLabel })}</Link>
        </Button>
      ) : null}
      {supportsGeneratedStorageSave(kind) ? (
        <SaveToStorageButton kind={kind} entityId={id} reportMonth={reportMonth} compact={compact} />
      ) : null}
    </div>
  );
}
