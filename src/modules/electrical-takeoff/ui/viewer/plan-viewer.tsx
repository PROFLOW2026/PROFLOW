'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Minus, Plus, Maximize2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CatalogType, EffectiveDetection, SheetDto } from '../../domain/contracts';
import {
  fitSelection,
  fitToRect,
  panBy,
  screenToPlan,
  unionRects,
  clampScale,
  planPointInViewport,
  zoomAtPoint,
  type ViewportState,
} from './viewer-math';
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
  areas = [],
  onSelectDetection,
  onPlanClick,
  onAreaPoint,
}: PlanViewerProps) {
  const t = useTranslations('takeoff');
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<ViewportState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [viewerSize, setViewerSize] = useState({ width: 800, height: 600 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);
  const activePointers = useRef(new Map<number, { x: number; y: number }>());

  const sheetDetections = useMemo(
    () => detections.filter((d) => d.sheetKey === sheet.sheetKey),
    [detections, sheet.sheetKey],
  );

  const fitAll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setViewport(
      fitToRect(
        { width: el.clientWidth, height: el.clientHeight },
        { width: sheet.widthPx, height: sheet.heightPx },
      ),
    );
  }, [sheet.heightPx, sheet.widthPx]);

  useEffect(() => {
    fitAll();
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        setViewerSize({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight });
      }
      fitAll();
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [fitAll, sheet.sheetKey]);

  useEffect(() => {
    if (highlightedIds.size === 0) return;
    const el = containerRef.current;
    if (!el) return;
    const rects = sheetDetections
      .filter((d) => highlightedIds.has(d.id))
      .map((d) => ({ x: d.x, y: d.y, width: d.w, height: d.h }));
    const union = unionRects(rects);
    if (!union) return;
    setViewport(fitSelection({ width: el.clientWidth, height: el.clientHeight }, union));
  }, [highlightedIds, sheetDetections]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setViewport((v) => zoomAtPoint(v, factor, e.clientX - rect.left, e.clientY - rect.top));
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
      setViewport((v) => zoomAtPoint(v, ratio, cx, cy));
      return;
    }
    const start = dragRef.current;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    dragRef.current = { x: e.clientX, y: e.clientY };
    setViewport((v) => panBy(v, dx, dy));
  }, []);

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
        <p className="truncate text-xs text-[var(--pf-text-secondary)]">{sheet.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => setViewport((v) => zoomAtPoint(v, 1.2, 0, 0))} aria-label={t('viewer.zoomIn')}>
            <Plus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={() => setViewport((v) => zoomAtPoint(v, 1 / 1.2, 0, 0))} aria-label={t('viewer.zoomOut')}>
            <Minus className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 min-w-11" onClick={fitAll} aria-label={t('viewer.fit')}>
            <Maximize2 className="size-4" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[min(52dvh,28rem)] min-w-0 flex-1 touch-none overflow-hidden bg-[var(--pf-bg-muted)]"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={handleClick}
        role="application"
        aria-label={t('viewer.aria')}
        tabIndex={0}
        onKeyDown={(e) => {
          const step = 24;
          if (e.key === 'ArrowLeft') setViewport((v) => panBy(v, step, 0));
          if (e.key === 'ArrowRight') setViewport((v) => panBy(v, -step, 0));
          if (e.key === 'ArrowUp') setViewport((v) => panBy(v, 0, step));
          if (e.key === 'ArrowDown') setViewport((v) => panBy(v, 0, -step));
          if (e.key === '+' || e.key === '=') setViewport((v) => zoomAtPoint(v, 1.15, 0, 0));
          if (e.key === '-') setViewport((v) => zoomAtPoint(v, 1 / 1.15, 0, 0));
        }}
      >
        <div
          className="absolute start-0 top-0 origin-top-left"
          style={{
            transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.scale})`,
            width: sheet.widthPx,
            height: sheet.heightPx,
          }}
        >
          {sheet.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sheet.previewUrl}
              alt=""
              draggable={false}
              className="pointer-events-none block h-full w-full select-none"
              width={sheet.widthPx}
              height={sheet.heightPx}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--pf-bg-page)] text-sm text-[var(--pf-text-muted)]">
              {t('viewer.noPreview')}
            </div>
          )}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${sheet.widthPx} ${sheet.heightPx}`}
            aria-hidden
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
              const selected = d.id === selectedId;
              const hl = highlightedIds.has(d.id);
              const opacity = dimOthers && !hl ? 0.25 : 1;
              return (
                <g key={d.id} opacity={opacity}>
                  <rect
                    x={d.x - d.w / 2}
                    y={d.y - d.h / 2}
                    width={d.w}
                    height={d.h}
                    rx={2}
                    fill={color}
                    fillOpacity={selected || hl ? 0.85 : 0.55}
                    stroke={selected ? '#0f172a' : color}
                    strokeWidth={selected ? 2.5 : 1}
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