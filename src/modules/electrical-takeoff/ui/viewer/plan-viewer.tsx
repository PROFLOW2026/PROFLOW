'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Expand, Minus, Plus, Maximize2, Minimize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CatalogType, EffectiveDetection, SheetDto } from '../../domain/contracts';
import {
  fitSelection,
  fitToRect,
  occurrenceFocusRect,
  panBy,
  screenToPlan,
  unionRects,
  clampScale,
  planPointInViewport,
  wheelZoomsPlan,
  zoomAtPoint,
  type ViewportState,
} from './viewer-math';
import { formatTakeoffDisplayName } from '../../domain/format-display-name';
import { detectionDisplayLabel } from '../boq-display';
import { devicesFromNote } from '../../domain/quantity-notes';
import { colorForDetection, detectionVisible, type TypeFilterState } from '../workspace/takeoff-workspace-state';

interface PlanViewerProps {
  sheet: SheetDto;
  detections: readonly EffectiveDetection[];
  catalog: readonly CatalogType[];
  filter: TypeFilterState;
  highlightedIds: ReadonlySet<string>;
  selectedId: string | null;
  dimOthers: boolean;
  addMode: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  areas?: readonly { id: string; polygon: [number, number][] }[];
  onSelectDetection: (id: string | null) => void;
  onPlanClick?: (x: number, y: number) => void;
  onAreaPoint?: (x: number, y: number) => void;
}

export function PlanViewer({
  sheet,
  detections,
  catalog,
  filter,
  highlightedIds,
  selectedId,
  dimOthers,
  addMode,
  expanded = false,
  onToggleExpanded,
  areas = [],
  onSelectDetection,
  onPlanClick,
  onAreaPoint,
}: PlanViewerProps) {
  const t = useTranslations('takeoff');
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [viewerSize, setViewerSize] = useState({ width: 800, height: 600 });
  const previewIdentity = `${sheet.sheetKey}:${sheet.previewUrl ?? ''}`;
  const [previewState, setPreviewState] = useState({ identity: previewIdentity, broken: false });
  const previewBroken = previewState.identity === previewIdentity && previewState.broken;
  const fittedSheet = useRef<string | null>(null);
  const userAdjusted = useRef(false);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());

  const sheetDetections = useMemo(
    () =>
      detections.filter((d) => d.sheetKey === sheet.sheetKey && !d.reasons.includes('drawing_noise')),
    [detections, sheet.sheetKey],
  );

  const applyFit = useCallback((width: number, height: number, force: boolean) => {
    if (width < 40 || height < 40) return;
    if (fittedSheet.current !== sheet.sheetKey) {
      fittedSheet.current = sheet.sheetKey;
      userAdjusted.current = false;
    }
    setViewerSize({ width, height });
    if (!force && userAdjusted.current) return;
    if (force) userAdjusted.current = false;
    setViewport(fitToRect({ width, height }, { width: sheet.widthPx, height: sheet.heightPx }));
  }, [sheet.heightPx, sheet.sheetKey, sheet.widthPx]);

  const fitAll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    applyFit(el.clientWidth, el.clientHeight, true);
  }, [applyFit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => applyFit(el.clientWidth, el.clientHeight, false);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [applyFit]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || el.clientWidth < 40 || el.clientHeight < 40) return;
    const selected = selectedId ? sheetDetections.find((detection) => detection.id === selectedId) : undefined;
    const union = selected
      ? occurrenceFocusRect(selected)
      : unionRects(
          sheetDetections
            .filter((detection) => highlightedIds.has(detection.id))
            .map((detection) => ({ x: detection.x, y: detection.y, width: detection.w, height: detection.h })),
        );
    if (!union) return;
    userAdjusted.current = true;
    setViewport(fitSelection({ width: el.clientWidth, height: el.clientHeight }, union, 72));
  }, [highlightedIds, selectedId, sheetDetections]);

  const zoomAtCenter = useCallback((factor: number) => {
    const el = containerRef.current;
    if (!el) return;
    userAdjusted.current = true;
    setViewport((v) => zoomAtPoint(v, factor, el.clientWidth / 2, el.clientHeight / 2));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onNativeWheel = (event: WheelEvent) => {
      if (!wheelZoomsPlan(event)) return;
      event.preventDefault();
      userAdjusted.current = true;
      const rect = el.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      setViewport((current) => zoomAtPoint(current, factor, event.clientX - rect.left, event.clientY - rect.top));
    };
    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (addMode && onPlanClick) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 2) {
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      pinchRef.current = { startDist: dist, startScale: viewport.scale };
      dragRef.current = null;
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY };
  }, [addMode, onPlanClick, viewport]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (activePointers.current.size >= 2 && pinchRef.current) {
      const pts = [...activePointers.current.values()];
      const dist = Math.max(1, Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y));
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = (pts[0]!.x + pts[1]!.x) / 2 - rect.left;
      const cy = (pts[0]!.y + pts[1]!.y) / 2 - rect.top;
      const nextScale = clampScale(pinchRef.current.startScale * (dist / pinchRef.current.startDist));
      const ratio = nextScale / viewport.scale;
      userAdjusted.current = true;
      setViewport((v) => zoomAtPoint(v, ratio, cx, cy));
      return;
    }
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    userAdjusted.current = true;
    setViewport((v) => panBy(v, dx, dy));
  }, [viewport.scale]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchRef.current = null;
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const pt = screenToPlan(e.clientX, e.clientY, el.getBoundingClientRect(), viewport);
      if (addMode) {
        onPlanClick?.(pt.x, pt.y);
        return;
      }
      if (onAreaPoint) {
        onAreaPoint(pt.x, pt.y);
      }
      const hit = sheetDetections.find(
        (d) =>
          Math.abs(d.x - pt.x) <= d.w &&
          Math.abs(d.y - pt.y) <= d.h &&
          detectionVisible(d, filter, highlightedIds, dimOthers),
      );
      onSelectDetection(hit?.id ?? null);
    },
    [addMode, dimOthers, filter, highlightedIds, onAreaPoint, onPlanClick, onSelectDetection, sheetDetections, viewport],
  );

  const visibleMarkers = useMemo(() => {
    return sheetDetections.filter((d) => {
      if (!detectionVisible(d, filter, highlightedIds, dimOthers)) return false;
      if (sheetDetections.length < 400) return true;
      return planPointInViewport(d.x, d.y, viewerSize, viewport);
    });
  }, [dimOthers, filter, highlightedIds, sheetDetections, viewport, viewerSize]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--pf-border-default)] px-2 py-1.5">
        <p className="truncate text-xs text-[var(--pf-text-secondary)]">
          {formatTakeoffDisplayName(sheet.name)}
          {!sheet.previewUrl || previewBroken ? <span className="ms-2 text-[var(--pf-text-muted)]">{t('viewer.noPreview')}</span> : null}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => zoomAtCenter(1.2)} aria-label={t('viewer.zoomIn')}>
            <Plus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => zoomAtCenter(1 / 1.2)} aria-label={t('viewer.zoomOut')}>
            <Minus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={fitAll} aria-label={t('viewer.fit')}>
            <Maximize2 className="size-4" />
          </Button>
          {onToggleExpanded ? (
            <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={onToggleExpanded} aria-label={expanded ? t('viewer.collapse') : t('viewer.expand')}>
              {expanded ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
            </Button>
          ) : null}
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative min-h-0 min-w-0 flex-1 touch-pan-y overflow-hidden bg-[var(--pf-bg-page)]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={handleClick}
        role="application"
        aria-label={t('viewer.aria')}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = 24;
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === '+' || e.key === '=' || e.key === '-') {
            userAdjusted.current = true;
          }
          if (e.key === 'ArrowLeft') setViewport((v) => panBy(v, step, 0));
          if (e.key === 'ArrowRight') setViewport((v) => panBy(v, -step, 0));
          if (e.key === 'ArrowUp') setViewport((v) => panBy(v, 0, step));
          if (e.key === 'ArrowDown') setViewport((v) => panBy(v, 0, -step));
          if (e.key === '+' || e.key === '=') zoomAtCenter(1.15);
          if (e.key === '-') zoomAtCenter(1 / 1.15);
        }}
      >
        <div
          className="absolute top-0 origin-top-left"
          style={{
            // Physical left. Logical start is the right edge under dir=rtl, which
            // shifts this layer away from screenToPlan and misses mark clicks.
            left: 0,
            right: 'auto',
            transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
            width: sheet.widthPx,
            height: sheet.heightPx,
          }}
        >
          {sheet.previewUrl && !previewBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sheet.previewUrl}
              alt=""
              draggable={false}
              className="pointer-events-none block h-full w-full max-w-none select-none object-fill"
              width={sheet.widthPx}
              height={sheet.heightPx}
              onError={() => setPreviewState({ identity: previewIdentity, broken: true })}
            />
          ) : (
            <div className="h-full w-full bg-white" aria-hidden />
          )}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${sheet.widthPx} ${sheet.heightPx}`}
          >
            {areas.map((area) => (
              <polygon
                key={area.id}
                points={area.polygon.map(([x, y]) => `${x},${y}`).join(' ')}
                fill="rgba(37,99,235,0.08)"
                stroke="#2563eb"
                strokeWidth={2}
              />
            ))}
            {visibleMarkers.map((d) => {
              const color = colorForDetection(d, catalog);
              const count = devicesFromNote(d.tagText);
              const label = `${detectionDisplayLabel(d, catalog, t('detection.unclassified'))}${count > 1 ? ` · ${count}` : ''}`;
              const selected = d.id === selectedId;
              const hl = highlightedIds.has(d.id);
              const opacity = dimOthers && !hl ? 0.25 : 1;
              return (
                <g
                  key={d.id}
                  data-testid="takeoff-plan-mark"
                  data-mark-id={d.id}
                  data-x={d.x}
                  data-y={d.y}
                  data-mark-label={label}
                  opacity={opacity}
                  role="img"
                  aria-label={label}
                >
                  <title>{label}</title>
                  <rect
                    x={d.x - d.w / 2}
                    y={d.y - d.h / 2}
                    width={d.w}
                    height={d.h}
                    fill={selected ? 'none' : color}
                    fillOpacity={selected ? 0 : hl ? 0.28 : 0.45}
                    stroke={selected ? '#ea580c' : color}
                    strokeWidth={selected ? Math.max(1.25, Math.max(d.w, d.h) * 0.08) : 1}
                    data-mark-fill={selected ? 'none' : color}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}