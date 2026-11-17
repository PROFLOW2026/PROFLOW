'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cadLayersToUi, type UiLayer } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-layers';
import { CadEngineClient } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-engine-client';
import { attachCadViewportInteraction } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-viewport-interaction';
import { cadViewportDevicePixelRatio } from '@/modules/external-storage/ui/cad/pf-cad-v3/cad-viewport-dpr';
import { createCadRenderer, type CadRendererHandle } from '@/modules/external-storage/ui/cad/pf-cad-v3/pf-renderer-bridge';
import { worldToScreen } from '@/modules/external-storage/ui/cad/pf-cad-v3/renderer/view-math';
import type { ScenePayload } from '@/modules/external-storage/ui/cad/pf-cad-v3/types';
import type { XrefDepBytes } from '@/modules/external-storage/ui/cad/pf-cad-v3/xref-resolver';
import { architecturalLayerIndexes, xrefDependencyPaths } from '../../domain/architectural-background';
import { solveModelWindow } from '../../domain/cad-sheet-frame';
import { symbolFrame, type CadNativeSample, type CadSheetMark } from '../../domain/cad-sheet-frame';
import {
  buildDisplaySheets,
  modelToPaper,
  modelViewExtent,
  projectSegments,
  viewportForMark,
  visibleViewports,
  type DisplaySheet,
  type Extent,
} from '../../domain/layout-display';

const EMPTY_INDEX = {
  byRelativePath: new Map(),
  byRelativePathLower: new Map(),
  byBasename: new Map(),
  byBasenameLower: new Map(),
};

const LOAD_LIMIT_MS = 90_000;

type Phase = 'download' | 'parse' | 'prepare' | 'ready' | 'error';

type LoadedModel = {
  segments: Float32Array;
  triangles: Float32Array;
  stride: number;
  triangleStride: number;
  origin: [number, number];
  contentExtent: Extent | undefined;
  layers: UiLayer[];
  spaces: string[];
  layouts: ScenePayload['sheets'];
  resolvedXrefs: number;
};

type ShownMark = {
  id: string;
  x: number;
  y: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  located: boolean;
};

/**
 * Shared by the main app, the employee app and the contractor app.
 * The stored count is not changed here: one detection stays one detection
 * even when its geometry is visible through more than one viewport.
 */
export function TakeoffDwgPlan({
  url,
  fileName,
  sheetKey,
  sheetName,
  kind: _kind,
  widthPx,
  heightPx,
  samples,
  marks,
  focusId,
  areas = [],
  backgroundRefs = [],
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
  backgroundRefs?: readonly { name: string; path?: string | null }[];
  onUnavailable: () => void;
  onSelectMark?: (id: string) => void;
  onPlanClick?: (x: number, y: number) => void;
}) {
  const t = useTranslations('takeoff');
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRendererHandle | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const extentRef = useRef<Extent>([0, 0, 1, 1]);
  const drawnRef = useRef<Float32Array>(new Float32Array(0));
  const shownRef = useRef<ShownMark[]>([]);
  const fittedRef = useRef(false);
  const selectRef = useRef(onSelectMark);
  const planClickRef = useRef(onPlanClick);
  const unavailableRef = useRef(onUnavailable);
  const focusIdRef = useRef(focusId);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const layersRef = useRef<UiLayer[]>([]);
  const architecturalRef = useRef<ReadonlySet<number>>(new Set());
  const backgroundRef = useRef<'hidden' | 'shown' | 'missing' | 'none'>('none');
  const [phase, setPhase] = useState<Phase>('download');
  const [percent, setPercent] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [sheetSource, setSheetSource] = useState<{
    spaces: string[];
    layouts: NonNullable<ScenePayload['sheets']>;
  } | null>(null);
  const [pickedSheetId, setPickedSheetId] = useState<string | null>(null);
  const [pickedFor, setPickedFor] = useState('');
  const [pickedWindows, setPickedWindows] = useState<number[]>([]);
  const [windowsFor, setWindowsFor] = useState('');
  const [viewToken, setViewToken] = useState(0);
  const [background, setBackground] = useState<'hidden' | 'shown' | 'missing' | 'none'>('none');
  const [focused, setFocused] = useState<{ id: string; located: boolean } | null>(null);
  const backgroundKey = backgroundRefs.map((ref) => `${ref.name}\t${ref.path ?? ''}`).join('\n');
  const preferred = `${sheetKey} ${sheetName}`;

  useEffect(() => {
    selectRef.current = onSelectMark;
    planClickRef.current = onPlanClick;
    unavailableRef.current = onUnavailable;
    focusIdRef.current = focusId;
    backgroundRef.current = background;
  });

  const plan = useMemo(() => {
    if (!sheetSource) return null;
    return buildDisplaySheets({
      spaces: sheetSource.spaces,
      layouts: sheetSource.layouts,
      marks: marks.map((mark) => ({ x: mark.nativeX, y: mark.nativeY })),
      preferredName: preferred,
    });
  }, [marks, preferred, sheetSource]);

  const focusedMark = marks.find((item) => item.id === focusId) ?? null;
  const pickScope = `${sheetKey}:${focusId ?? ''}`;
  const sheetId = chooseSheetId(plan, pickedFor === pickScope ? pickedSheetId : null, pickedSheetId, focusedMark);
  const sheet = plan?.sheets.find((item) => item.id === sheetId) ?? plan?.sheets[0] ?? null;
  const activeIds = useMemo(() => {
    const stored = windowsFor === `${sheetKey}:${sheet?.id ?? ''}` ? pickedWindows : [];
    if (!sheet || !focusedMark || sheet.kind !== 'layout') return stored;
    const hit = viewportForMark(sheet, focusedMark.nativeX, focusedMark.nativeY, stored);
    if (!hit || visibleViewports(sheet, stored).some((vp) => vp.id === hit.id)) return stored;
    const stack = sheet.stacks.find((group) => group.some((vp) => vp.id === hit.id)) ?? [];
    const members = new Set(stack.map((vp) => vp.id));
    return [...stored.filter((id) => !members.has(id)), hit.id];
  }, [focusedMark, pickedWindows, sheet, sheetKey, windowsFor]);

  const drawOverlay = () => {
    const renderer = rendererRef.current;
    const gl = glRef.current;
    const overlay = overlayRef.current;
    if (!renderer || !gl || !overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    if (overlay.width !== gl.width || overlay.height !== gl.height) {
      overlay.width = gl.width;
      overlay.height = gl.height;
    }
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const view = renderer.getView();
    const viewport = { width: overlay.width, height: overlay.height };
    const frame = shownRef.current;
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.45)';
    ctx.lineWidth = 1.5;
    for (const area of areas) {
      const points = area.polygon
        .map(([x, y]) => previewToNative(x, y, samples, widthPx, heightPx))
        .map((point) => (point ? toDisplay(point.x, point.y, sheet, activeIds, modelRef.current) : null))
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
    const active = frame.find((mark) => mark.id === focusIdRef.current);
    if (!active?.located) return;
    const [x0, y0] = worldToScreen(active.minX, active.maxY, view, viewport);
    const [x1, y1] = worldToScreen(active.maxX, active.minY, view, viewport);
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  };
  const drawRef = useRef(drawOverlay);
  useEffect(() => {
    drawRef.current = drawOverlay;
  });

  useEffect(() => {
    const canvas = glRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const renderer = createCadRenderer({ canvas, onAfterViewChange: () => drawRef.current() });
    rendererRef.current = renderer;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      renderer.resize(entry.contentRect.width, entry.contentRect.height, cadViewportDevicePixelRatio());
      const [x0, y0, x1, y1] = extentRef.current;
      if (!fittedRef.current && entry.contentRect.width >= 64 && entry.contentRect.height >= 64 && x1 - x0 > 2 && y1 - y0 > 2) {
        renderer.focusExtent(extentRef.current, 28);
        fittedRef.current = true;
      }
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
      const rect = canvas.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width;
      const sy = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height;
      const view = renderer.getView();
      const viewport = { width: canvas.width, height: canvas.height };
      let nearest: { id: string; distance: number } | null = null;
      for (const mark of shownRef.current) {
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
      const native = fromDisplay(wx, wy, sheet, activeIds, modelRef.current);
      const preview = native ? nativeToPreview(native.x, native.y, samples, widthPx, heightPx) : null;
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
      { wheelZoom: 'always' },
    );
    return () => {
      observer.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      detach();
      renderer.dispose();
      rendererRef.current = null;
    };
    // The canvas lives for the lifetime of this file. Sheet changes do not recreate it.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- interaction uses refs
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setPhase('error');
    }, LOAD_LIMIT_MS);
    const client = new CadEngineClient();
    void (async () => {
      try {
        setPhase('download');
        setPercent(null);
        const hostBytes = await readBytes(url, (ratio) => {
          if (!cancelled) setPercent(Math.round(ratio * 100));
        });
        if (cancelled) return;
        const refs = backgroundKey
          .split('\n')
          .filter((row) => row.length > 0)
          .map((row) => {
            const [name, path] = row.split('\t');
            return { name: name ?? '', path: path || null };
          });
        const deps: XrefDepBytes[] = [];
        let missing = refs.length > 0;
        for (const ref of refs) {
          try {
            const bytes = await readBytes(`${url}/background?name=${encodeURIComponent(ref.name)}`);
            for (const path of xrefDependencyPaths(ref.name, ref.path)) deps.push({ path, bytes });
            missing = false;
          } catch {
            /* This xref is not in the connected folder. */
          }
        }
        if (cancelled) return;
        setPhase('parse');
        setPercent(null);
        const parsed = await client.parseDwgFromStorage({
          fileName,
          hostBytes,
          fileIndex: EMPTY_INDEX,
          skipXrefClosure: true,
          cachedDeps: deps,
        });
        if (cancelled) return;
        setPhase('prepare');
        const scene = parsed.scene;
        const layers = cadLayersToUi(scene.layers);
        const architectural = new Set(architecturalLayerIndexes(layers, refs.map((ref) => ref.name)));
        layersRef.current = layers;
        architecturalRef.current = architectural;
        const resolved = scene.report?.resolvedXrefs ?? 0;
        const nextBackground = refs.length === 0 ? 'none' : missing || resolved === 0 || architectural.size === 0 ? 'missing' : 'shown';
        backgroundRef.current = nextBackground;
        setBackground(nextBackground);
        const origin = scene.origin ?? [0, 0];
        const layouts = scene.sheets ?? [];
        modelRef.current = {
          segments: parsed.segments,
          triangles: parsed.triangles ?? new Float32Array(0),
          stride: scene.segmentStride || 8,
          triangleStride: scene.triangleStride || 10,
          origin,
          contentExtent: scene.contentExtent,
          layers,
          spaces: scene.spaces ?? [],
          layouts,
          resolvedXrefs: resolved,
        };
        setSheetSource({
          spaces: scene.spaces ?? [],
          layouts,
        });
        setPhase('ready');
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : '';
        if (message === 'source_unavailable') unavailableRef.current();
        setPhase('error');
      } finally {
        window.clearTimeout(timer);
        client.dispose();
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      client.dispose();
    };
  }, [attempt, backgroundKey, fileName, url]);

  useEffect(() => {
    const model = modelRef.current;
    const renderer = rendererRef.current;
    const current = sheet;
    if (!model || !renderer || !current || phase !== 'ready') return;
    let cancelled = false;
    const visible = visibleViewports(current, activeIds);
    const drawing = current.kind === 'model'
      ? {
          segments: model.segments,
          triangles: model.triangles,
          extent: modelViewExtent(
            model.contentExtent,
            marks.map((mark) => ({ x: mark.nativeX, y: mark.nativeY })),
            model.origin,
          ),
        }
      : projectSegments({
          segments: model.segments,
          triangles: model.triangles,
          stride: model.stride,
          triangleStride: model.triangleStride,
          origin: model.origin,
          viewports: visible,
        });
    extentRef.current = drawing.extent;
    drawnRef.current = drawing.segments;
    fittedRef.current = false;
    const hidden = backgroundRef.current === 'hidden';
    const layers = model.layers.map((layer) => ({
      ...layer,
      visible: architecturalRef.current.has(layer.index) ? !hidden && layer.visible : layer.visible,
    }));
    void renderer.setDrawingAsync(
      drawing.segments,
      drawing.extent,
      layers,
      drawing.extent,
      drawing.triangles,
      model.stride,
    ).then(() => {
      if (cancelled) return;
      renderer.focusExtent(drawing.extent, 28);
      fittedRef.current = true;
      setViewToken((value) => value + 1);
      drawRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [activeIds, marks, phase, sheet]);

  useEffect(() => {
    const model = modelRef.current;
    const renderer = rendererRef.current;
    const current = sheet;
    if (!model || !renderer || !current || phase !== 'ready' || viewToken === 0) return;
    const frame = placeMarks(current, activeIds, marks, model, drawnRef.current, focusId, architecturalRef.current);
    shownRef.current = frame;
    const active = frame.find((item) => item.id === focusId) ?? null;
    setFocused(active ? { id: active.id, located: active.located } : null);
    if (!active) {
      renderer.focusExtent(extentRef.current, 28);
    } else if (!active.located) {
      const span = Math.max(Math.abs(active.maxX - active.minX), 80);
      renderer.focusExtent([active.x - span, active.y - span, active.x + span, active.y + span], 36);
    } else {
      const span = Math.max(active.maxX - active.minX, active.maxY - active.minY, 1);
      const pad = Math.max(span * 5, 24);
      const cx = (active.minX + active.maxX) / 2;
      const cy = (active.minY + active.maxY) / 2;
      renderer.focusExtent([cx - pad, cy - pad, cx + pad, cy + pad], 36);
    }
    drawRef.current();
  }, [activeIds, focusId, marks, phase, sheet, viewToken]);

  const stacks = sheet?.stacks.filter((stack) => stack.length > 1) ?? [];
  const phaseLabel = phase === 'download'
    ? t('viewer.dwgDownloading')
    : phase === 'parse'
      ? t('viewer.dwgParsing')
      : phase === 'prepare'
        ? t('viewer.dwgPreparing')
        : phase === 'error'
          ? t('viewer.dwgFailed')
          : null;

  return (
    <div
      ref={hostRef}
      className="relative h-full min-h-0 w-full max-w-full overflow-hidden bg-[#1e2124] lg:absolute lg:inset-0"
      data-testid="takeoff-dwg-plan"
      data-cad-space={sheet?.space ?? ''}
      data-cad-sheets={plan?.sheets.length ?? 0}
      data-load-phase={phase}
      data-focus-id={focused?.id ?? ''}
      data-focus-located={focused ? String(focused.located) : ''}
    >
      <canvas ref={glRef} className="absolute inset-0 size-full touch-none" aria-label={t('viewer.aria')} />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" />
      {phaseLabel ? (
        <div className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-white/90">
          <p data-testid="takeoff-load-phase">
            {phaseLabel}
            {phase === 'download' && percent !== null ? ` ${percent}%` : ''}
          </p>
          {phase === 'error' ? (
            <Button type="button" variant="secondary" className="min-h-11" onClick={() => setAttempt((value) => value + 1)}>
              {t('viewer.dwgRetry')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {background === 'missing' && phase === 'ready' ? (
        <p className="absolute inset-x-2 top-14 z-10 text-center text-xs text-white/90" data-testid="takeoff-background-missing">
          {t('viewer.backgroundMissing')}
        </p>
      ) : null}
      {phase === 'ready' && focused && !focused.located ? (
        <p className="absolute inset-x-2 bottom-16 z-10 text-center text-xs text-white/90" data-testid="takeoff-symbol-unlocated">
          {t('viewer.symbolUnlocated')}
        </p>
      ) : null}
      {phase === 'ready' && plan && plan.sheets.length > 1 ? (
        <label className="absolute start-2 top-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-2 text-xs text-white">
          <span>{t('viewer.sheetPicker')}</span>
          <select
            className="min-h-11 max-w-full rounded border border-white/20 bg-[#2a2e32] px-2"
            data-testid="takeoff-sheet-select"
            value={sheet?.id ?? 'model'}
            onChange={(event) => {
              setPickedFor(pickScope);
              setPickedSheetId(event.target.value);
              setWindowsFor(`${sheetKey}:${event.target.value}`);
              setPickedWindows([]);
            }}
          >
            {plan.sheets.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {phase === 'ready' && stacks.length > 0 ? (
        <div className="absolute start-2 top-16 z-10 flex max-w-[calc(100%-1rem)] flex-wrap gap-2">
          {stacks.map((stack) => (
            <label key={stack.map((vp) => vp.id).join('-')} className="flex items-center gap-2 text-xs text-white">
              <span>{t('viewer.windowPicker')}</span>
              <select
                className="min-h-11 max-w-full rounded border border-white/20 bg-[#2a2e32] px-2"
                data-testid="takeoff-window-select"
                value={String((stack.find((vp) => activeIds.includes(vp.id)) ?? stack[0])?.id ?? '')}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  const members = new Set(stack.map((vp) => vp.id));
                  setWindowsFor(`${sheetKey}:${sheet?.id ?? ''}`);
                  setPickedWindows((ids) => [...ids.filter((id) => !members.has(id)), next]);
                }}
              >
                {stack.map((vp, index) => (
                  <option key={vp.id} value={vp.id}>
                    {t('viewer.windowOption', { n: index + 1 })}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : null}
      {background === 'shown' || background === 'hidden' ? (
        <Button
          type="button"
          variant="secondary"
          className="absolute end-2 top-2 z-10 min-h-11"
          data-testid="takeoff-background-toggle"
          aria-pressed={background === 'shown'}
          onClick={() => {
            const renderer = rendererRef.current;
            const layers = layersRef.current;
            if (!renderer || layers.length === 0) return;
            const next = background === 'shown' ? 'hidden' : 'shown';
            renderer.applyLayerVisibility(
              layers.map((layer) => ({
                ...layer,
                visible: architecturalRef.current.has(layer.index) ? next === 'shown' && layer.visible : layer.visible,
              })),
            );
            backgroundRef.current = next;
            setBackground(next);
            drawRef.current();
          }}
        >
          {background === 'shown' ? t('viewer.hideBackground') : t('viewer.showBackground')}
        </Button>
      ) : null}
      <div className="absolute bottom-2 start-2 z-10 flex gap-1">
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
            rendererRef.current?.focusExtent(extentRef.current, 28);
            drawRef.current();
          }}
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function chooseSheetId(
  plan: { sheets: readonly DisplaySheet[]; initialId: string } | null,
  matchingPick: string | null,
  lastPick: string | null,
  mark: { nativeX: number; nativeY: number } | null,
): string {
  if (!plan) return 'model';
  if (matchingPick && plan.sheets.some((item) => item.id === matchingPick)) return matchingPick;
  if (lastPick === 'model') return 'model';
  if (lastPick?.startsWith('layout:') && mark) {
    const owner = plan.sheets.find(
      (item) => item.kind === 'layout' && viewportForMark(item, mark.nativeX, mark.nativeY, []),
    );
    if (owner) return owner.id;
  }
  return plan.sheets.some((item) => item.id === plan.initialId) ? plan.initialId : 'model';
}

function placeMarks(
  sheet: DisplaySheet | null,
  activeIds: readonly number[],
  marks: readonly CadSheetMark[],
  model: LoadedModel | null,
  segments: Float32Array,
  focusId: string | null,
  skipLayers: ReadonlySet<number>,
): ShownMark[] {
  if (!sheet || !model) return [];
  const placed = marks.flatMap((mark) => {
    const point = toDisplay(mark.nativeX, mark.nativeY, sheet, activeIds, model);
    return point ? [{ id: mark.id, ...point }] : [];
  });
  return placed.map((mark) => {
    if (mark.id !== focusId) {
      return { ...mark, minX: mark.x, minY: mark.y, maxX: mark.x, maxY: mark.y, located: false };
    }
    const box = symbolFrame(segments, mark.x, mark.y, placed, mark.id, skipLayers);
    return { ...mark, ...box };
  });
}

function toDisplay(
  nativeX: number,
  nativeY: number,
  sheet: DisplaySheet | null,
  activeIds: readonly number[],
  model: LoadedModel | null,
): { x: number; y: number } | null {
  if (!model) return null;
  if (!sheet || sheet.kind === 'model') return { x: nativeX - model.origin[0], y: nativeY - model.origin[1] };
  const vp = viewportForMark(sheet, nativeX, nativeY, activeIds);
  if (!vp || !visibleViewports(sheet, activeIds).some((item) => item.id === vp.id)) return null;
  return modelToPaper(nativeX, nativeY, vp);
}

function fromDisplay(
  x: number,
  y: number,
  sheet: DisplaySheet | null,
  activeIds: readonly number[],
  model: LoadedModel | null,
): { x: number; y: number } | null {
  if (!model || !sheet || sheet.kind === 'model') {
    if (!model) return null;
    return { x: x + model.origin[0], y: y + model.origin[1] };
  }
  const visible = visibleViewports(sheet, activeIds);
  const vp = visible.find((item) => {
    const left = item.cx - item.w / 2;
    const right = item.cx + item.w / 2;
    const bottom = item.cy - item.h / 2;
    const top = item.cy + item.h / 2;
    return x >= left && x <= right && y >= bottom && y <= top;
  }) ?? visible[0];
  if (!vp) return null;
  const scale = vp.h / vp.vh;
  const dx = (x - vp.cx) / scale;
  const dy = (y - vp.cy) / scale;
  const c = Math.cos(vp.twist);
  const s = Math.sin(vp.twist);
  return { x: vp.vcx + c * dx + s * dy, y: vp.vcy - s * dx + c * dy };
}

function previewToNative(
  previewX: number,
  previewY: number,
  samples: readonly CadNativeSample[],
  widthPx: number,
  heightPx: number,
): { x: number; y: number } | null {
  const window = solveModelWindow(samples, widthPx, heightPx);
  if (!window || widthPx <= 0 || heightPx <= 0) return null;
  return {
    x: window.cx - window.hw + (previewX / widthPx) * 2 * window.hw,
    y: window.cy + window.hh - (previewY / heightPx) * 2 * window.hh,
  };
}

function nativeToPreview(
  nativeX: number,
  nativeY: number,
  samples: readonly CadNativeSample[],
  widthPx: number,
  heightPx: number,
): { x: number; y: number } | null {
  const window = solveModelWindow(samples, widthPx, heightPx);
  if (!window || widthPx <= 0 || heightPx <= 0) return null;
  return {
    x: ((nativeX - (window.cx - window.hw)) / (2 * window.hw)) * widthPx,
    y: ((window.cy + window.hh - nativeY) / (2 * window.hh)) * heightPx,
  };
}

function screenToWorld(
  sx: number,
  sy: number,
  view: { panX: number; panY: number; zoom: number },
  viewport: { width: number; height: number },
): [number, number] {
  const zoom = view.zoom || 1;
  return [(sx - viewport.width * 0.5) / zoom + view.panX, -(sy - viewport.height * 0.5) / zoom + view.panY];
}

async function readBytes(url: string, onProgress?: (ratio: number) => void): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('source_unavailable');
  if (!response.body) return new Uint8Array(await response.arrayBuffer());
  const total = Number(response.headers.get('content-length') || 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(step.value);
    loaded += step.value.byteLength;
    if (total > 0) onProgress?.(loaded / total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
