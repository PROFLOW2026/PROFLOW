'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { CadEngineClient, type FileIndex } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-engine-client';
import { attachCadViewportInteraction } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-viewport-interaction';
import { cadViewportDevicePixelRatio } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-viewport-dpr';
import { createCadRenderer, type CadRendererHandle } from '@/modules/external-storage/ui/cad/pf-cad-v3/pf-renderer-bridge';
import { worldToScreen } from '@/modules/external-storage/ui/cad/pf-cad-v3/renderer/view-math';
import type { ScenePayload } from '@/modules/external-storage/ui/cad/pf-cad-v3/types';
import {
  chooseCadSheetFrame,
  previewToWorld,
  worldToPreview,
  type CadNativeSample,
  type CadSheetFrame,
  type CadSheetMark,
  type CadSpaceGeometry,
} from '../../domain/cad-sheet-frame';

const EMPTY_INDEX: FileIndex = {
  byRelativePath: new Map(),
  byRelativePathLower: new Map(),
  byBasename: new Map(),
  byBasenameLower: new Map(),
};

type ParsedSpace = CadSpaceGeometry & {
  contentExtent: [number, number, number, number];
  fullExtent: [number, number, number, number];
  triangles: Float32Array;
  segmentStride: number;
};

export function TakeoffDwgPlan({
  url,
  fileName,
  sheetKey,
  sheetName,
  kind,
  widthPx,
  heightPx,
  samples,
  marks,
  focusId,
  areas = [],
  onUnavailable,
  onSelectMark,
  onPlanClick,
}: {
  url: string;
  fileName: string;
  sheetKey: string;
  sheetName: string;
  kind: 'dwg_layout' | 'dwg_model';
  widthPx: number;
  heightPx: number;
  samples: readonly CadNativeSample[];
  marks: readonly CadSheetMark[];
  focusId: string | null;
  areas?: readonly { id: string; polygon: readonly [number, number][] }[];
  onUnavailable: () => void;
  onSelectMark?: (id: string) => void;
  onPlanClick?: (x: number, y: number) => void;
}) {
  const t = useTranslations('takeoff');
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRendererHandle | null>(null);
  const frameRef = useRef<CadSheetFrame | null>(null);
  const focusIdRef = useRef(focusId);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectRef = useRef(onSelectMark);
  const planClickRef = useRef(onPlanClick);
  const unavailableRef = useRef(onUnavailable);
  const [viewState, setViewState] = useState<{ status: 'loading' | 'ready'; parses: number; space: string }>({
    status: 'loading',
    parses: 0,
    space: '',
  });
  const [focused, setFocused] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    selectRef.current = onSelectMark;
    planClickRef.current = onPlanClick;
    unavailableRef.current = onUnavailable;
    focusIdRef.current = focusId;
  });

  const drawOverlay = () => {
    const frame = frameRef.current;
    const renderer = rendererRef.current;
    const gl = glRef.current;
    const overlay = overlayRef.current;
    if (!frame || !renderer || !gl || !overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    if (overlay.width !== gl.width || overlay.height !== gl.height) {
      overlay.width = gl.width;
      overlay.height = gl.height;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const view = renderer.getView();
    const viewport = { width: overlay.width, height: overlay.height };
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.45)';
    ctx.lineWidth = 1.5;
    for (const area of areas) {
      const points = area.polygon
        .map(([x, y]) => previewToWorld(x, y, frame, widthPx, heightPx))
        .filter((point): point is { x: number; y: number } => point !== null)
        .map((point) => worldToScreen(point.x, point.y, view, viewport));
      if (points.length < 3) continue;
      ctx.beginPath();
      const first = points[0];
      if (!first) continue;
      ctx.moveTo(first[0], first[1]);
      for (const point of points.slice(1)) ctx.lineTo(point[0], point[1]);
      ctx.closePath();
      ctx.stroke();
    }
    const activeId = focusIdRef.current;
    const active = frame.marks.find((mark) => mark.id === activeId) ?? frame.marks[0];
    if (!active) return;
    const [sx, sy] = worldToScreen(active.x, active.y, view, viewport);
    const edge = worldToScreen(active.x + active.half, active.y, view, viewport);
    const radius = Math.max(10, Math.hypot(edge[0] - sx, edge[1] - sy));
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx - radius, sy - radius, radius * 2, radius * 2);
  };
  const drawRef = useRef(drawOverlay);
  useEffect(() => {
    drawRef.current = drawOverlay;
  });

  useEffect(() => {
    const canvas = glRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let cancelled = false;
    const renderer = createCadRenderer({
      canvas,
      onAfterViewChange: () => drawRef.current(),
    });
    rendererRef.current = renderer;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      renderer.resize(entry.contentRect.width, entry.contentRect.height, cadViewportDevicePixelRatio());
      drawRef.current();
    });
    observer.observe(host);
    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      const start = pointerRef.current;
      pointerRef.current = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
      const frame = frameRef.current;
      const gl = canvas;
      if (!frame) return;
      const rect = gl.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * gl.width;
      const sy = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * gl.height;
      const view = renderer.getView();
      const viewport = { width: gl.width, height: gl.height };
      let nearest: { id: string; distance: number } | null = null;
      for (const mark of frame.marks) {
        const [mx, my] = worldToScreen(mark.x, mark.y, view, viewport);
        const distance = Math.hypot(mx - sx, my - sy);
        if (distance < 28 && (!nearest || distance < nearest.distance)) nearest = { id: mark.id, distance };
      }
      if (nearest && selectRef.current) {
        selectRef.current(nearest.id);
        return;
      }
      const click = planClickRef.current;
      if (!click) return;
      const [wx, wy] = screenToWorld(sx, sy, view, viewport);
      const preview = worldToPreview(wx, wy, frame, widthPx, heightPx);
      if (preview) click(preview.x, preview.y);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);
    const detach = attachCadViewportInteraction(
      canvas,
      {
        panBy: (dx, dy) => renderer.panBy(dx, dy),
        zoomAt: (sx, sy, factor) => renderer.zoomAt(sx, sy, factor),
        panAndZoomAt: (dx, dy, sx, sy, factor) => renderer.panAndZoomAt(dx, dy, sx, sy, factor),
      },
      { wheelZoom: 'modified' },
    );
    const client = new CadEngineClient();
    void (async () => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (!response.ok) throw new Error('source_unavailable');
        const hostBytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        const parsed: ParsedSpace[] = [];
        let parses = 0;
        const first = await client.parseDwgFromStorage({
          fileName,
          hostBytes: hostBytes.slice(),
          fileIndex: EMPTY_INDEX,
          skipXrefClosure: true,
        });
        parses += 1;
        parsed.push(toParsed(first.scene, first.segments, first.triangles));
        for (const space of first.scene.spaces ?? []) {
          if (space === first.scene.space) continue;
          const next = await client.parseDwgFromStorage({
            fileName,
            hostBytes: hostBytes.slice(),
            fileIndex: EMPTY_INDEX,
            skipXrefClosure: true,
            cachedDeps: [],
            space,
          });
          parses += 1;
          parsed.push(toParsed(next.scene, next.segments, next.triangles));
        }
        if (cancelled) return;
        const frame = chooseCadSheetFrame({
          sheetKey,
          sheetName,
          kind,
          widthPx,
          heightPx,
          samples,
          marks,
          spaces: parsed,
        });
        const chosen = parsed.find((space) => space.space === frame?.space);
        if (!frame || !chosen) throw new Error('frame_unavailable');
        frameRef.current = frame;
        const extent = chosen.contentExtent;
        await renderer.setDrawingAsync(
          chosen.segments,
          extent,
          undefined,
          chosen.fullExtent,
          chosen.triangles,
          chosen.segmentStride,
        );
        if (cancelled) return;
        focusMark(renderer, frame, focusIdRef.current);
        const active = frame.marks.find((mark) => mark.id === focusIdRef.current) ?? frame.marks[0] ?? null;
        setFocused(active ? { id: active.id, x: active.x, y: active.y } : null);
        setViewState({ status: 'ready', parses, space: frame.space });
        drawRef.current();
      } catch {
        if (!cancelled) unavailableRef.current();
      } finally {
        client.dispose();
      }
    })();
    return () => {
      cancelled = true;
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      detach();
      renderer.dispose();
      rendererRef.current = null;
    };
    // Samples and marks are read for the initial frame of this file and sheet.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- occurrence changes must not reparse
  }, [fileName, heightPx, kind, sheetKey, sheetName, url, widthPx]);

  useEffect(() => {
    const frame = frameRef.current;
    const renderer = rendererRef.current;
    if (!frame || !renderer || viewState.status !== 'ready') return;
    focusMark(renderer, frame, focusId);
    const active = frame.marks.find((mark) => mark.id === focusId) ?? frame.marks[0] ?? null;
    setFocused(active ? { id: active.id, x: active.x, y: active.y } : null);
    drawRef.current();
  }, [focusId, viewState.status]);

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full overflow-hidden bg-[#1e2124] lg:absolute lg:inset-0"
      data-testid="takeoff-dwg-plan"
      data-cad-space={viewState.space}
      data-cad-parses={viewState.parses}
      data-focus-id={focused?.id ?? ''}
      data-focus-x={focused ? focused.x.toFixed(2) : ''}
      data-focus-y={focused ? focused.y.toFixed(2) : ''}
    >
      <canvas ref={glRef} className="absolute inset-0 size-full touch-none" aria-label={t('viewer.aria')} />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" />
      {viewState.status === 'loading' ? (
        <p className="absolute inset-x-0 top-2 text-center text-xs text-white/80">{t('viewer.dwgLoading')}</p>
      ) : null}
      <div className="absolute bottom-2 start-2 flex gap-1">
        <Button type="button" variant="secondary" className="min-h-11 min-w-11 px-0" aria-label={t('viewer.zoomIn')} onClick={() => rendererRef.current?.zoom(1.25)}>
          <Plus className="size-4" />
        </Button>
        <Button type="button" variant="secondary" className="min-h-11 min-w-11 px-0" aria-label={t('viewer.zoomOut')} onClick={() => rendererRef.current?.zoom(1 / 1.25)}>
          <Minus className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="min-h-11 min-w-11 px-0"
          aria-label={t('viewer.fit')}
          onClick={() => {
            const frame = frameRef.current;
            const renderer = rendererRef.current;
            if (!frame || !renderer) return;
            focusMark(renderer, frame, focusIdRef.current);
          }}
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function screenToWorld(
  sx: number,
  sy: number,
  view: { panX: number; panY: number; zoom: number },
  viewport: { width: number; height: number },
): [number, number] {
  const zoom = view.zoom || 1;
  return [
    (sx - viewport.width * 0.5) / zoom + view.panX,
    -(sy - viewport.height * 0.5) / zoom + view.panY,
  ];
}

function focusMark(renderer: CadRendererHandle, frame: CadSheetFrame, focusId: string | null) {
  const mark = frame.marks.find((item) => item.id === focusId) ?? frame.marks[0];
  if (!mark) {
    renderer.fit();
    return;
  }
  const span = mark.half * 3;
  renderer.focusExtent([mark.x - span, mark.y - span, mark.x + span, mark.y + span], 28);
}

function toParsed(scene: ScenePayload, segments: Float32Array, triangles: Float32Array | undefined): ParsedSpace {
  const extent = scene.contentExtent ?? scene.robustExtent;
  return {
    space: scene.space,
    origin: scene.origin,
    segments,
    texts: scene.texts.map((text) => text.t).filter((text) => text.length > 0),
    contentExtent: extent,
    fullExtent: scene.fullExtent,
    triangles: triangles ?? new Float32Array(0),
    segmentStride: scene.segmentStride,
  };
}
