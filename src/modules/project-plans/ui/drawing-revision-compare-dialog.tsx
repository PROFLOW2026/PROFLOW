'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { INTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { StorageFilePreviewShell } from '@/modules/external-storage/ui/storage-file-preview-shell';

const PdfJsViewer = dynamic(
  () => import('@/modules/external-storage/ui/pdf-js-viewer').then((module) => module.PdfJsViewer),
  { ssr: false, loading: () => <div className="relative min-h-[40vh] flex-1" aria-busy="true" /> },
);

export type RevisionCompareSide = {
  readonly id: string;
  readonly revisionLabel: string;
  readonly fileName: string;
};

export function DrawingRevisionCompareDialog({
  open,
  onOpenChange,
  left,
  right,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly left: RevisionCompareSide;
  readonly right: RevisionCompareSide;
}) {
  const t = useTranslations('projectPlans.sheetMarks');
  const tCommon = useTranslations('common');
  const [reloadLeft, setReloadLeft] = useState(0);
  const [reloadRight, setReloadRight] = useState(0);

  if (!open) return null;

  const leftUrl = `${INTERNAL_REVISION_DOWNLOAD_PATH}/${left.id}`;
  const rightUrl = `${INTERNAL_REVISION_DOWNLOAD_PATH}/${right.id}`;

  return (
    <StorageFilePreviewShell
      open={open}
      onClose={() => onOpenChange(false)}
      closeLabel={tCommon('actions.close')}
      title={t('compareTitle')}
    >
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-2">
        <ComparePane
          label={`Rev ${left.revisionLabel}`}
          fileName={left.fileName}
          url={leftUrl}
          reloadKey={reloadLeft}
          onRetry={() => setReloadLeft((key) => key + 1)}
        />
        <ComparePane
          label={`Rev ${right.revisionLabel}`}
          fileName={right.fileName}
          url={rightUrl}
          reloadKey={reloadRight}
          onRetry={() => setReloadRight((key) => key + 1)}
        />
      </div>
    </StorageFilePreviewShell>
  );
}

function ComparePane({
  label,
  fileName,
  url,
  reloadKey,
  onRetry,
}: {
  readonly label: string;
  readonly fileName: string;
  readonly url: string;
  readonly reloadKey: number;
  readonly onRetry: () => void;
}) {
  const tCommon = useTranslations('common');
  return (
    <div className="flex min-h-[50vh] min-w-0 flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--pf-border-default)] px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-[var(--pf-text-secondary)]">{fileName}</p>
        </div>
        <a
          href={url}
          download={fileName}
          className="shrink-0 text-xs font-medium text-[var(--pf-text-brand)] hover:underline"
        >
          {tCommon('actions.download')}
        </a>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <PdfJsViewer url={url} reloadKey={reloadKey} onRetry={onRetry} />
      </div>
    </div>
  );
}
