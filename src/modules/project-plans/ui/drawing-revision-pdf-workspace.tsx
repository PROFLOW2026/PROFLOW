'use client';

import dynamic from 'next/dynamic';
import { MapPin, Ruler, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createDrawingSheetMarkAction,
  deleteDrawingSheetMarkAction,
  listDrawingSheetMarksAction,
} from '@/modules/project-plans/actions/sheet-marks-actions';
import type { SheetMarkView } from '@/modules/project-plans/application/sheet-marks';
import { measurePixelDistance } from '@/modules/project-plans/domain/sheet-measure';
import { INTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { StorageFilePreviewShell } from '@/modules/external-storage/ui/storage-file-preview-shell';
import type { PdfPageOverlayRenderProps } from '@/modules/external-storage/ui/pdf-js-viewer';
import {
  DrawingSheetMarksPageOverlay,
  type MeasureDraft,
  type SheetMarkTool,
} from './drawing-sheet-marks-overlay';

const PdfJsViewer = dynamic(
  () => import('@/modules/external-storage/ui/pdf-js-viewer').then((module) => module.PdfJsViewer),
  { ssr: false, loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" /> },
);

export function DrawingRevisionPdfWorkspace({
  open,
  onOpenChange,
  projectId,
  revisionId,
  revisionLabel,
  fileName,
  canEdit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly projectId: string;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly fileName: string;
  readonly canEdit: boolean;
}) {
  const t = useTranslations('projectPlans.sheetMarks');
  const tCommon = useTranslations('common');
  const [reloadKey, setReloadKey] = useState(0);
  const [marks, setMarks] = useState<readonly SheetMarkView[]>([]);
  const [tool, setTool] = useState<SheetMarkTool>('view');
  const [measureDraft, setMeasureDraft] = useState<MeasureDraft | null>(null);
  const [pendingScale, setPendingScale] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);

  const contentUrl = `${INTERNAL_REVISION_DOWNLOAD_PATH}/${revisionId}`;
  const downloadUrl = contentUrl;

  const refreshMarks = useCallback(async () => {
    const result = await listDrawingSheetMarksAction({ revisionId });
    if (result.ok) {
      setMarks(result.data);
      setLoadError(null);
    } else {
      setLoadError(result.error);
    }
  }, [revisionId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listDrawingSheetMarksAction({ revisionId }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setMarks(result.data);
        setLoadError(null);
      } else {
        setLoadError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, revisionId]);

  const finishMeasure = useCallback(
    async (draft: MeasureDraft, scaleMetersPerPixel: number, pageWidth: number, pageHeight: number) => {
      if (!draft.second) return;
      const points = [draft.first, draft.second] as const;
      const pixelDist = measurePixelDistance(points, pageWidth, pageHeight);
      if (pixelDist <= 0 || !Number.isFinite(scaleMetersPerPixel)) return;
      const result = await createDrawingSheetMarkAction({
        projectId,
        drawingRevisionId: revisionId,
        pageIndex: draft.pageIndex,
        kind: 'measure',
        geometry: {
          points: [draft.first, draft.second],
          scale: scaleMetersPerPixel,
          unit: 'm',
          pixelDistance: pixelDist,
        },
      });
      if (result.ok) {
        setMeasureDraft(null);
        setPendingScale('');
        setTool('view');
        await refreshMarks();
      } else {
        window.alert(result.error);
      }
    },
    [projectId, revisionId, refreshMarks],
  );

  const promptNoteFields = useCallback(() => {
    const note = window.prompt(t('notePrompt'))?.trim() ?? '';
    if (!note) return null;
    const boqRaw = window.prompt(t('boqPrompt'))?.trim() ?? '';
    const boqId = boqRaw.length > 0 ? boqRaw : undefined;
    return { note, boqId };
  }, [t]);

  const handlePageClick = useCallback(
    async (pageIndex: number, x: number, y: number, pageWidth: number, pageHeight: number) => {
      if (!canEdit) return;

      if (tool === 'pin') {
        const result = await createDrawingSheetMarkAction({
          projectId,
          drawingRevisionId: revisionId,
          pageIndex,
          kind: 'pin',
          geometry: { x, y },
        });
        if (result.ok) {
          setTool('view');
          await refreshMarks();
        } else window.alert(result.error);
        return;
      }

      if (tool === 'note') {
        const fields = promptNoteFields();
        if (!fields) return;
        const result = await createDrawingSheetMarkAction({
          projectId,
          drawingRevisionId: revisionId,
          pageIndex,
          kind: 'note',
          geometry: { x, y },
          note: fields.note,
          ...(fields.boqId
            ? { linkedEntityType: 'boq_node' as const, linkedEntityId: fields.boqId }
            : {}),
        });
        if (result.ok) {
          setTool('view');
          await refreshMarks();
        } else window.alert(result.error);
        return;
      }

      if (tool === 'measure') {
        if (pendingScale) {
          const scale = Number.parseFloat(pendingScale);
          if (measureDraft?.second && Number.isFinite(scale) && scale > 0) {
            await finishMeasure(measureDraft, scale, pageWidth, pageHeight);
            return;
          }
        }
        if (!measureDraft || measureDraft.pageIndex !== pageIndex) {
          setMeasureDraft({ pageIndex, first: [x, y] });
          return;
        }
        if (!measureDraft.second) {
          setMeasureDraft({ ...measureDraft, second: [x, y] });
          const scaleRaw = window.prompt(t('scalePrompt'));
          const scale = scaleRaw != null ? Number.parseFloat(scaleRaw) : Number.NaN;
          if (!Number.isFinite(scale) || scale <= 0) {
            setMeasureDraft(null);
            return;
          }
          await finishMeasure({ ...measureDraft, second: [x, y] }, scale, pageWidth, pageHeight);
        }
      }
    },
    [
      canEdit,
      tool,
      projectId,
      revisionId,
      refreshMarks,
      promptNoteFields,
      measureDraft,
      pendingScale,
      finishMeasure,
      t,
    ],
  );

  const pageOverlay = useMemo(() => {
    function DrawingSheetPageOverlay(props: PdfPageOverlayRenderProps) {
      return (
      <DrawingSheetMarksPageOverlay
        pageNumber={props.pageNumber}
        pageWidth={props.pageWidth}
        pageHeight={props.pageHeight}
        marks={marks}
        tool={tool}
        canEdit={canEdit}
        measureDraft={measureDraft}
        onPageClick={(pageIndex, x, y) => {
          void handlePageClick(pageIndex, x, y, props.pageWidth, props.pageHeight);
        }}
        onDeleteMark={
          canEdit
            ? (markId) => {
                void (async () => {
                  const result = await deleteDrawingSheetMarkAction({ projectId, markId });
                  if (result.ok) await refreshMarks();
                  else window.alert(result.error);
                })();
              }
            : undefined
        }
        />
      );
    }
    return DrawingSheetPageOverlay;
  }, [marks, tool, canEdit, measureDraft, handlePageClick, projectId, refreshMarks]);

  if (!open) return null;

  return (
    <StorageFilePreviewShell
      open={open}
      onClose={() => onOpenChange(false)}
      closeLabel={tCommon('actions.close')}
      title={`${t('title')} · Rev ${revisionLabel}`}
      headerActions={
        <a
          href={downloadUrl}
          download={fileName}
          className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-[var(--pf-text-brand)] hover:underline"
        >
          {tCommon('actions.download')}
        </a>
      }
      headerLeading={
        canEdit ? (
          <div className="flex flex-wrap items-center gap-1">
            <ToolButton
              active={tool === 'view'}
              label={t('toolView')}
              onClick={() => {
                setTool('view');
                setMeasureDraft(null);
              }}
            />
            <ToolButton active={tool === 'pin'} label={t('toolPin')} icon={MapPin} onClick={() => setTool('pin')} />
            <ToolButton active={tool === 'note'} label={t('toolNote')} icon={StickyNote} onClick={() => setTool('note')} />
            <ToolButton active={tool === 'measure'} label={t('toolMeasure')} icon={Ruler} onClick={() => setTool('measure')} />
            {tool === 'measure' ? (
              <Label className="ms-2 flex items-center gap-1 text-xs text-[var(--pf-text-secondary)]">
                {t('scaleLabel')}
                <Input
                  className="h-7 w-24 text-xs"
                  inputMode="decimal"
                  value={pendingScale}
                  placeholder="0.01"
                  onChange={(event) => setPendingScale(event.target.value)}
                />
              </Label>
            ) : null}
          </div>
        ) : null
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {loadError ? (
          <p className="shrink-0 px-3 py-2 text-xs text-[var(--pf-status-danger-fg)]">{loadError}</p>
        ) : null}
        <PdfJsViewer
          url={contentUrl}
          reloadKey={reloadKey}
          onRetry={() => setReloadKey((key) => key + 1)}
          pageOverlay={pageOverlay}
        />
      </div>
    </StorageFilePreviewShell>
  );
}

function ToolButton({
  active,
  label,
  icon: Icon,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon?: typeof MapPin;
  readonly onClick: () => void;
}) {
  return (
    <Button type="button" size="sm" variant={active ? 'primary' : 'secondary'} onClick={onClick}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
