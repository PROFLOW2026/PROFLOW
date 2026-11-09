'use client';

import { GitCompare, ScanEye } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DrawingRevisionWithAcks } from '@/modules/project-plans';
import { INTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { DrawingRevisionCompareDialog } from './drawing-revision-compare-dialog';
import { DrawingRevisionPdfWorkspace } from './drawing-revision-pdf-workspace';

function isPdfRevision(revision: DrawingRevisionWithAcks): boolean {
  return revision.fileReady && revision.mimeType === 'application/pdf';
}

export function InternalDrawingRevisionsPanel({
  projectId,
  revisions,
  canManage,
}: {
  readonly projectId: string;
  readonly revisions: readonly DrawingRevisionWithAcks[];
  readonly canManage: boolean;
}) {
  const t = useTranslations('projectPlans.detail');
  const tMarks = useTranslations('projectPlans.sheetMarks');

  const pdfRevisions = useMemo(() => revisions.filter(isPdfRevision), [revisions]);

  const [previewRevisionId, setPreviewRevisionId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);

  const previewRevision = revisions.find((revision) => revision.id === previewRevisionId) ?? null;

  const compareLeft = revisions.find((revision) => revision.id === compareLeftId) ?? null;
  const compareRight = revisions.find((revision) => revision.id === compareRightId) ?? null;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {pdfRevisions.length >= 2 ? (
          <>
            <Select value={compareLeftId ?? ''} onValueChange={setCompareLeftId}>
              <SelectTrigger className="h-9 w-[8.5rem]">
                <SelectValue placeholder={tMarks('compareLeft')} />
              </SelectTrigger>
              <SelectContent>
                {pdfRevisions.map((revision) => (
                  <SelectItem key={revision.id} value={revision.id}>
                    Rev {revision.revisionLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={compareRightId ?? ''} onValueChange={setCompareRightId}>
              <SelectTrigger className="h-9 w-[8.5rem]">
                <SelectValue placeholder={tMarks('compareRight')} />
              </SelectTrigger>
              <SelectContent>
                {pdfRevisions.map((revision) => (
                  <SelectItem key={revision.id} value={revision.id}>
                    Rev {revision.revisionLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!compareLeft || !compareRight || compareLeft.id === compareRight.id}
              onClick={() => setCompareOpen(true)}
            >
              <GitCompare className="size-4" aria-hidden />
              {tMarks('compareAction')}
            </Button>
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        {revisions.map((revision) => {
          const pdf = isPdfRevision(revision);
          return (
            <div
              key={revision.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pf-border-default)] py-2 last:border-0"
            >
              <div>
                <span className="font-medium">Rev {revision.revisionLabel}</span>
                <Badge tone="neutral" className="ms-2">
                  {t(`revisionStatus.${revision.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {revision.fileReady ? (
                  <>
                    <a
                      href={`${INTERNAL_REVISION_DOWNLOAD_PATH}/${revision.id}`}
                      className="text-sm text-[var(--pf-text-brand)] hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {revision.fileName}
                    </a>
                    {pdf ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setPreviewRevisionId(revision.id)}
                      >
                        <ScanEye className="size-4" aria-hidden />
                        {tMarks('previewPdf')}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {previewRevision && isPdfRevision(previewRevision) ? (
        <DrawingRevisionPdfWorkspace
          open={Boolean(previewRevisionId)}
          onOpenChange={(open) => {
            if (!open) setPreviewRevisionId(null);
          }}
          projectId={projectId}
          revisionId={previewRevision.id}
          revisionLabel={previewRevision.revisionLabel}
          fileName={previewRevision.fileName}
          canEdit={canManage}
        />
      ) : null}

      {compareLeft && compareRight && isPdfRevision(compareLeft) && isPdfRevision(compareRight) ? (
        <DrawingRevisionCompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          left={{
            id: compareLeft.id,
            revisionLabel: compareLeft.revisionLabel,
            fileName: compareLeft.fileName,
          }}
          right={{
            id: compareRight.id,
            revisionLabel: compareRight.revisionLabel,
            fileName: compareRight.fileName,
          }}
        />
      ) : null}
    </>
  );
}
