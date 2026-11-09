'use client';

import dynamic from 'next/dynamic';
import { MapPin, Ruler, Square, StickyNote } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createDrawingSheetMarkAction,
  deleteDrawingSheetMarkAction,
  listDrawingSheetMarksAction,
  listSheetMarkBoqPickerLinesAction,
} from '@/modules/project-plans/actions/sheet-marks-actions';
import type { SheetMarkView } from '@/modules/project-plans/application/sheet-marks';
import {
  formatMeasureAreaSqM,
  measureLineQuantityMeters,
  measureRectangleAreaSqMeters,
} from '@/modules/project-plans/domain/sheet-measure-area';
import { formatMeasureMeters, measurePixelDistance } from '@/modules/project-plans/domain/sheet-measure';
import { INTERNAL_REVISION_DOWNLOAD_PATH } from '@/modules/project-plans/download-paths';
import { StorageFilePreviewShell } from '@/modules/external-storage/ui/storage-file-preview-shell';
import type { PdfPageOverlayRenderProps } from '@/modules/external-storage/ui/pdf-js-viewer';
import {
  DrawingSheetMarksPageOverlay,
  type MeasureDraft,
  type SheetMarkTool,
} from './drawing-sheet-marks-overlay';
import { SheetMarkSaveDialog, type SheetMarkSaveDialogMode } from './sheet-mark-save-dialog';
import type { SheetMarkBoqLineOption } from './sheet-mark-boq-picker';

const PdfJsViewer = dynamic(
  () => import('@/modules/external-storage/ui/pdf-js-viewer').then((module) => module.PdfJsViewer),
  { ssr: false, loading: () => <div className="relative min-h-0 flex-1" aria-busy="true" /> },
);

type PendingMeasure = {
  readonly draft: MeasureDraft;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly shape: 'line' | 'rectangle';
};

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
  const [measureShape, setMeasureShape] = useState<'line' | 'rectangle'>('line');
  const [pendingScale, setPendingScale] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [boqLines, setBoqLines] = useState<readonly SheetMarkBoqLineOption[]>([]);
  const [saveDialogMode, setSaveDialogMode] = useState<SheetMarkSaveDialogMode | null>(null);
  const [pendingMeasure, setPendingMeasure] = useState<PendingMeasure | null>(null);
  const [pendingNote, setPendingNote] = useState<{ pageIndex: number; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open || !canEdit) return;
    let cancelled = false;
    void listSheetMarkBoqPickerLinesAction({ projectId }).then((result) => {
      if (cancelled || !result.ok) return;
      setBoqLines(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canEdit, projectId]);

  const parseScale = useCallback((): number | null => {
    const scale = Number.parseFloat(pendingScale);
    if (!Number.isFinite(scale) || scale <= 0) return null;
    return scale;
  }, [pendingScale]);

  const openMeasureConfirm = useCallback(
    (pending: PendingMeasure) => {
      const scale = parseScale();
      if (scale == null || !pending.draft.second) return;
      const points = [pending.draft.first, pending.draft.second] as const;
      const value =
        pending.shape === 'rectangle'
          ? formatMeasureAreaSqM(
              measureRectangleAreaSqMeters(points, scale, pending.pageWidth, pending.pageHeight),
            )
          : formatMeasureMeters(
              measureLineQuantityMeters(points, scale, pending.pageWidth, pending.pageHeight),
            );
      setPendingMeasure(pending);
      setSaveDialogMode({
        kind: 'measure',
        pageIndex: pending.draft.pageIndex,
        quantityLabel:
          pending.shape === 'rectangle' ? t('previewArea') : t('previewLength'),
        quantityValue: value,
      });
    },
    [parseScale, t],
  );

  const persistMeasure = useCallback(
    async (input: { boqNodeId: string | null }) => {
      if (!pendingMeasure?.draft.second) return;
      const scale = parseScale();
      if (scale == null) return;
      setSaving(true);
      const points = [pendingMeasure.draft.first, pendingMeasure.draft.second] as const;
      const pixelDistance = measurePixelDistance(points, pendingMeasure.pageWidth, pendingMeasure.pageHeight);
      const geometry: Record<string, unknown> = {
        shape: pendingMeasure.shape,
        points,
        scale,
        unit: 'm',
        measurementSourceRevisionId: revisionId,
        pixelDistance,
      };
      if (pendingMeasure.shape === 'rectangle') {
        const widthPx = Math.abs(points[1][0] - points[0][0]) * pendingMeasure.pageWidth;
        const heightPx = Math.abs(points[1][1] - points[0][1]) * pendingMeasure.pageHeight;
        geometry.pixelArea = widthPx * heightPx;
      }
      const result = await createDrawingSheetMarkAction({
        projectId,
        drawingRevisionId: revisionId,
        pageIndex: pendingMeasure.draft.pageIndex,
        kind: 'measure',
        geometry,
        ...(input.boqNodeId
          ? { linkedEntityType: 'boq_node' as const, linkedEntityId: input.boqNodeId }
          : {}),
      });
      setSaving(false);
      if (result.ok) {
        setMeasureDraft(null);
        setPendingMeasure(null);
        setSaveDialogMode(null);
        setTool('view');
        await refreshMarks();
      } else {
        window.alert(result.error);
      }
    },
    [parseScale, pendingMeasure, projectId, revisionId, refreshMarks],
  );

  const persistNote = useCallback(
    async (input: { note?: string; boqNodeId: string | null }) => {
      if (!pendingNote || !input.note) return;
      setSaving(true);
      const result = await createDrawingSheetMarkAction({
        projectId,
        drawingRevisionId: revisionId,
        pageIndex: pendingNote.pageIndex,
        kind: 'note',
        geometry: { x: pendingNote.x, y: pendingNote.y },
        note: input.note,
        ...(input.boqNodeId
          ? { linkedEntityType: 'boq_node' as const, linkedEntityId: input.boqNodeId }
          : {}),
      });
      setSaving(false);
      if (result.ok) {
        setPendingNote(null);
        setSaveDialogMode(null);
        setTool('view');
        await refreshMarks();
      } else {
        window.alert(result.error);
      }
    },
    [pendingNote, projectId, revisionId, refreshMarks],
  );

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
        setPendingNote({ pageIndex, x, y });
        setSaveDialogMode({ kind: 'note', pageIndex, x, y });
        return;
      }

      if (tool === 'measure' || tool === 'measure_area') {
        const shape = tool === 'measure_area' ? 'rectangle' : measureShape;
        if (!measureDraft || measureDraft.pageIndex !== pageIndex) {
          setMeasureDraft({ pageIndex, first: [x, y] });
          return;
        }
        if (!measureDraft.second) {
          const nextDraft = { ...measureDraft, second: [x, y] as const };
          setMeasureDraft(nextDraft);
          openMeasureConfirm({
            draft: nextDraft,
            pageWidth,
            pageHeight,
            shape,
          });
        }
      }
    },
    [
      canEdit,
      tool,
      projectId,
      revisionId,
      refreshMarks,
      measureDraft,
      measureShape,
      openMeasureConfirm,
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
    <>
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
              <ToolButton
                active={tool === 'note'}
                label={t('toolNote')}
                icon={StickyNote}
                onClick={() => setTool('note')}
              />
              <ToolButton
                active={tool === 'measure'}
                label={t('toolMeasure')}
                icon={Ruler}
                onClick={() => {
                  setMeasureShape('line');
                  setTool('measure');
                }}
              />
              <ToolButton
                active={tool === 'measure_area'}
                label={t('toolMeasureArea')}
                icon={Square}
                onClick={() => {
                  setMeasureShape('rectangle');
                  setTool('measure_area');
                }}
              />
              {tool === 'measure' || tool === 'measure_area' ? (
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

      <SheetMarkSaveDialog
        open={Boolean(saveDialogMode)}
        mode={saveDialogMode}
        boqLines={boqLines}
        busy={saving}
        onCancel={() => {
          setSaveDialogMode(null);
          setPendingMeasure(null);
          setPendingNote(null);
          setMeasureDraft(null);
        }}
        onConfirm={(input) => {
          if (saveDialogMode?.kind === 'measure') {
            void persistMeasure(input);
          } else {
            void persistNote(input);
          }
        }}
      />
    </>
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
