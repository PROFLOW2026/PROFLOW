'use client';

import { MapPin, StickyNote, X } from 'lucide-react';
import { useCallback, type MouseEvent } from 'react';
import type { SheetMarkView } from '@/modules/project-plans/application/sheet-marks';
import {
  formatMeasureAreaSqM,
  measureLineQuantityMeters,
  measureRectangleAreaSqMeters,
} from '@/modules/project-plans/domain/sheet-measure-area';
import { formatMeasureMeters } from '@/modules/project-plans/domain/sheet-measure';
import { cn } from '@/shared/ui/cn';

export type SheetMarkTool = 'view' | 'pin' | 'note' | 'measure' | 'measure_area';

export type MeasureDraft = {
  readonly pageIndex: number;
  readonly first: readonly [number, number];
  readonly second?: readonly [number, number];
};

function readPoint(geometry: Record<string, unknown>): readonly [number, number] | null {
  const x = geometry.x;
  const y = geometry.y;
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return [x, y];
}

function readMeasureShape(geometry: Record<string, unknown>): 'line' | 'rectangle' {
  return geometry.shape === 'rectangle' ? 'rectangle' : 'line';
}

function readMeasurePoints(
  geometry: Record<string, unknown>,
): readonly [readonly [number, number], readonly [number, number]] | null {
  const raw = geometry.points;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const a = raw[0];
  const b = raw[1];
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 2 || b.length !== 2) return null;
  if (typeof a[0] !== 'number' || typeof a[1] !== 'number') return null;
  if (typeof b[0] !== 'number' || typeof b[1] !== 'number') return null;
  return [
    [a[0], a[1]],
    [b[0], b[1]],
  ];
}

function readMeasureScale(geometry: Record<string, unknown>): number | null {
  const scale = geometry.scale;
  return typeof scale === 'number' && Number.isFinite(scale) ? scale : null;
}

export function DrawingSheetMarksPageOverlay({
  pageNumber,
  pageWidth,
  pageHeight,
  marks,
  tool,
  canEdit,
  measureDraft,
  onPageClick,
  onDeleteMark,
}: {
  readonly pageNumber: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly marks: readonly SheetMarkView[];
  readonly tool: SheetMarkTool;
  readonly canEdit: boolean;
  readonly measureDraft: MeasureDraft | null;
  readonly onPageClick: (pageIndex: number, x: number, y: number) => void;
  readonly onDeleteMark?: (markId: string) => void;
}) {
  const pageIndex = pageNumber - 1;
  const pageMarks = marks.filter((mark) => mark.pageIndex === pageIndex);

  const normalizeClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    return { x, y };
  }, []);

  const interactive = canEdit && tool !== 'view';

  return (
    <div
      className={cn(
        'absolute inset-0',
        interactive ? 'cursor-crosshair' : 'pointer-events-none',
      )}
      role="presentation"
      onClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              const { x, y } = normalizeClick(event);
              onPageClick(pageIndex, x, y);
            }
          : undefined
      }
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox={`0 0 ${pageWidth} ${pageHeight}`}
        aria-hidden
      >
        {pageMarks.map((mark) => {
          if (mark.kind !== 'measure') return null;
          const points = readMeasurePoints(mark.geometry);
          const scale = readMeasureScale(mark.geometry);
          if (!points || scale == null) return null;
          const [[x1, y1], [x2, y2]] = points;
          const px1 = x1 * pageWidth;
          const py1 = y1 * pageHeight;
          const px2 = x2 * pageWidth;
          const py2 = y2 * pageHeight;
          const shape = readMeasureShape(mark.geometry);
          const midX = (px1 + px2) / 2;
          const midY = (py1 + py2) / 2;
          const label =
            shape === 'rectangle'
              ? formatMeasureAreaSqM(measureRectangleAreaSqMeters(points, scale, pageWidth, pageHeight))
              : formatMeasureMeters(measureLineQuantityMeters(points, scale, pageWidth, pageHeight));
          const rectX = Math.min(px1, px2);
          const rectY = Math.min(py1, py2);
          const rectW = Math.abs(px2 - px1);
          const rectH = Math.abs(py2 - py1);
          return (
            <g key={mark.id}>
              {shape === 'rectangle' ? (
                <rect
                  x={rectX}
                  y={rectY}
                  width={rectW}
                  height={rectH}
                  fill="color-mix(in srgb, var(--pf-text-brand) 12%, transparent)"
                  stroke="var(--pf-text-brand)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              ) : (
                <line
                  x1={px1}
                  y1={py1}
                  x2={px2}
                  y2={py2}
                  stroke="var(--pf-text-brand)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                />
              )}
              <text
                x={midX}
                y={midY - 6}
                textAnchor="middle"
                className="fill-[var(--pf-text-primary)] text-[11px] font-medium"
                style={{ paintOrder: 'stroke', stroke: 'var(--pf-bg-surface)', strokeWidth: 3 }}
              >
                {label}
              </text>
            </g>
          );
        })}
        {measureDraft && measureDraft.pageIndex === pageIndex && measureDraft.second ? (
          (() => {
            const [x1, y1] = measureDraft.first;
            const [x2, y2] = measureDraft.second;
            const px1 = x1 * pageWidth;
            const py1 = y1 * pageHeight;
            const px2 = x2 * pageWidth;
            const py2 = y2 * pageHeight;
            if (tool === 'measure_area') {
              return (
                <rect
                  x={Math.min(px1, px2)}
                  y={Math.min(py1, py2)}
                  width={Math.abs(px2 - px1)}
                  height={Math.abs(py2 - py1)}
                  fill="color-mix(in srgb, var(--pf-status-warning-fg) 15%, transparent)"
                  stroke="var(--pf-status-warning-fg)"
                  strokeWidth={2}
                />
              );
            }
            return (
              <line
                x1={px1}
                y1={py1}
                x2={px2}
                y2={py2}
                stroke="var(--pf-status-warning-fg)"
                strokeWidth={2}
              />
            );
          })()
        ) : null}
      </svg>

      {pageMarks.map((mark) => {
        if (mark.kind === 'measure') {
          const points = readMeasurePoints(mark.geometry);
          if (!points) return null;
          const [[x1, y1], [x2, y2]] = points;
          return (
            <span key={`${mark.id}-handles`}>
              <MarkHandle left={x1} top={y1} />
              <MarkHandle left={x2} top={y2} />
            </span>
          );
        }
        const point = readPoint(mark.geometry);
        if (!point) return null;
        const [x, y] = point;
        return (
          <MarkBubble
            key={mark.id}
            left={x}
            top={y}
            kind={mark.kind}
            note={mark.note}
            linkedEntityId={mark.linkedEntityId}
            canDelete={canEdit && Boolean(onDeleteMark)}
            onDelete={onDeleteMark ? () => onDeleteMark(mark.id) : undefined}
          />
        );
      })}

      {measureDraft && measureDraft.pageIndex === pageIndex ? (
        <MarkHandle left={measureDraft.first[0]} top={measureDraft.first[1]} draft />
      ) : null}
      {measureDraft?.second && measureDraft.pageIndex === pageIndex ? (
        <MarkHandle left={measureDraft.second[0]} top={measureDraft.second[1]} draft />
      ) : null}
    </div>
  );
}

function MarkHandle({
  left,
  top,
  draft,
}: {
  readonly left: number;
  readonly top: number;
  readonly draft?: boolean;
}) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--pf-bg-surface)]',
        draft ? 'bg-[var(--pf-status-warning-fg)]' : 'bg-[var(--pf-text-brand)]',
      )}
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
      aria-hidden
    />
  );
}

function MarkBubble({
  left,
  top,
  kind,
  note,
  linkedEntityId,
  canDelete,
  onDelete,
}: {
  readonly left: number;
  readonly top: number;
  readonly kind: 'pin' | 'note';
  readonly note: string | null;
  readonly linkedEntityId: string | null;
  readonly canDelete: boolean;
  readonly onDelete?: () => void;
}) {
  const Icon = kind === 'pin' ? MapPin : StickyNote;
  return (
    <div
      className="pointer-events-auto absolute flex max-w-[min(14rem,40vw)] -translate-x-1/2 -translate-y-full flex-col items-center gap-0.5"
      style={{ left: `${left * 100}%`, top: `${top * 100}%` }}
    >
      <span className="group relative inline-flex" onClick={(e) => e.stopPropagation()} role="presentation">
        <Icon
          className={cn(
            'size-6 drop-shadow',
            kind === 'pin' ? 'text-[var(--pf-status-danger-fg)]' : 'text-[var(--pf-status-info-fg)]',
          )}
          aria-hidden
        />
        {canDelete && onDelete ? (
          <button
            type="button"
            className="absolute -end-2 -top-2 hidden size-5 items-center justify-center rounded-full border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] text-[var(--pf-text-secondary)] group-hover:flex"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <X className="size-3" aria-hidden />
            <span className="sr-only">Remove</span>
          </button>
        ) : null}
      </span>
      {kind === 'note' && (note || linkedEntityId) ? (
        <CardMini note={note} linkedEntityId={linkedEntityId} />
      ) : null}
    </div>
  );
}

function CardMini({ note, linkedEntityId }: { readonly note: string | null; readonly linkedEntityId: string | null }) {
  return (
    <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 py-1 text-[10px] leading-snug text-[var(--pf-text-primary)] shadow-sm">
      {note ? <p>{note}</p> : null}
      {linkedEntityId ? (
        <p className="mt-0.5 font-mono text-[var(--pf-text-secondary)]">
          BOQ {linkedEntityId.slice(0, 8)}…
        </p>
      ) : null}
    </div>
  );
}
