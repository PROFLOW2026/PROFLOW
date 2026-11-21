'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Maximize2, Minus, Plus } from 'lucide-react';
import { useCadLoadNotice } from '@/modules/external-storage/ui/cad/use-cad-load-notice';
import { useCadTools } from '@/modules/external-storage/ui/cad/use-cad-tools';
import { drawCadText } from '@/modules/external-storage/ui/cad/pf-cad-v3/draw-cad-text';
import type { ArchitectureMode } from '@/modules/external-storage/ui/cad/architecture-display';
import { PF_CAD_TREE_ID } from '@/modules/external-storage/ui/cad/pf-cad-v3/pf-cad-config';
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
import { displayArchitecturalLayerIndexes, xrefDependencyPaths } from '../../domain/architectural-background';
import { solveModelWindow } from '../../domain/cad-sheet-frame';
import {
  cadInsertFocusExtent,
  cadSymbolFocusExtent,
  isPlausibleSymbolBox,
  symbolFrame,
  symbolGlyphStrokes,
  symbolGlyphSvg,
  type CadNativeSample,
  type CadSheetMark,
} from '../../domain/cad-sheet-frame';
import { chooseTakeoffSheetId, focusLevel, type FocusLevel } from '../../domain/focus-level';
import {
  insertHalfForSymbolFocus,
  padFactorForSymbolFocus,
  readStoredSymbolFocusZoom,
  subscribeSymbolFocusZoom,
  SYMBOL_FOCUS_ZOOM_DEFAULT,
  SYMBOL_FOCUS_ZOOM_MAX,
  SYMBOL_FOCUS_ZOOM_MIN,
  writeStoredSymbolFocusZoom,
} from './symbol-focus-zoom';
import {
  buildDisplaySheets,
  modelToPaper,
  modelViewExtent,
  planGeometryOrModel,
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

type Phase = 'download' | 'xref' | 'parse' | 'prepare' | 'ready' | 'error' | 'missing';

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
  texts: ScenePayload['texts'];
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

function applyOccurrenceFocus(
  renderer: CadRendererHandle,
  active: ShownMark,
  level: FocusLevel,
  zoomLevel: number,
) {
  if (level === 'point' || !isPlausibleSymbolBox(active)) {
    renderer.focusExtent(
      cadInsertFocusExtent(active.x, active.y, insertHalfForSymbolFocus(zoomLevel)),
      28,
    );
    return;
  }
  renderer.focusExtent(cadSymbolFocusExtent(active, padFactorForSymbolFocus(zoomLevel)), 24);
}

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
  onSymbolGlyphs,
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
  onSymbolGlyphs?: (glyphs: Record<string, string>) => void;
}) {
  const t = useTranslations('takeoff');
  const [archMode, setArchMode] = useState<ArchitectureMode>('original');
  const [archStrength, setArchStrength] = useState(0.7);
  const [toolLayers, setToolLayers] = useState<UiLayer[]>([]);
  const [toolTexts, setToolTexts] = useState<{ text: string; x: number; y: number; layer: number }[]>([]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const archModeRef = useRef(archMode);
  const archStrengthRef = useRef(archStrength);
  useEffect(() => {
    archModeRef.current = archMode;
    archStrengthRef.current = archStrength;
  }, [archMode, archStrength]);
  const textRef = useRef<HTMLCanvasElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRendererHandle | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const extentRef = useRef<Extent>([0, 0, 1, 1]);
  const drawnRef = useRef<Float32Array>(new Float32Array(0));
  const shownRef = useRef<ShownMark[]>([]);
  const fittedRef = useRef(false);
  const lastFitKeyRef = useRef('');
  const lastFocusKeyRef = useRef('');
  const fittedSizeRef = useRef({ w: 0, h: 0 });
  const focusZoom = useSyncExternalStore(
    subscribeSymbolFocusZoom,
    readStoredSymbolFocusZoom,
    () => SYMBOL_FOCUS_ZOOM_DEFAULT,
  );
  const focusZoomRef = useRef(focusZoom);
  useEffect(() => {
    focusZoomRef.current = focusZoom;
  }, [focusZoom]);
  const selectRef = useRef(onSelectMark);
  const planClickRef = useRef(onPlanClick);
  const unavailableRef = useRef(onUnavailable);
  const focusIdRef = useRef(focusId);
  const marksRef = useRef(marks);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const layersRef = useRef<UiLayer[]>([]);
  const architecturalRef = useRef<ReadonlySet<number>>(new Set());
  const backgroundRef = useRef<'hidden' | 'shown' | 'missing' | 'none'>('none');
  const [phase, setPhase] = useState<Phase>('download');
  const [percent, setPercent] = useState<number | null>(null);
  const loadWait = useCadLoadNotice(
    phase !== 'ready' && phase !== 'error' && phase !== 'missing',
    `${phase}:${percent ?? ''}`,
    phase === 'error' || phase === 'missing',
  );
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
  const [focused, setFocused] = useState<{ id: string; level: FocusLevel } | null>(null);
  const backgroundKey = backgroundRefs.map((ref) => `${ref.name}\t${ref.path ?? ''}`).join('\n');
  const preferred = `${sheetKey} ${sheetName}`;

  useEffect(() => {
    selectRef.current = onSelectMark;
    planClickRef.current = onPlanClick;
    unavailableRef.current = onUnavailable;
    focusIdRef.current = focusId;
    backgroundRef.current = background;
    marksRef.current = marks;
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
  const sheetId = chooseTakeoffSheetId(plan, pickedFor === pickScope ? pickedSheetId : null, pickedSheetId, focusedMark);
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
    if (active && focusLevel(true, active.located) === 'symbol') {
      const [x0, y0] = worldToScreen(active.minX, active.maxY, view, viewport);
      const [x1, y1] = worldToScreen(active.maxX, active.minY, view, viewport);
      ctx.strokeStyle = '#ea580c';
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      return;
    }
    if (active && focusLevel(true, active.located) === 'point') {
      const [sx, sy] = worldToScreen(active.x, active.y, view, viewport);
      ctx.strokeStyle = '#ea580c';
      ctx.fillStyle = '#ea580c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(sx - 12, sy);
      ctx.lineTo(sx + 12, sy);
      ctx.moveTo(sx, sy - 12);
      ctx.lineTo(sx, sy + 12);
      ctx.stroke();
    }
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
      const width = entry.contentRect.width;
      const height = entry.contentRect.height;
      const extentReady = x1 - x0 > 2 && y1 - y0 > 2;
      const grewFromEmpty = fittedRef.current && fittedSizeRef.current.w < 64 && width >= 64 && height >= 64;
      if (extentReady && ((!fittedRef.current && width >= 64 && height >= 64) || grewFromEmpty)) {
        const active = shownRef.current.find((item) => item.id === focusIdRef.current);
        if (active) {
          const located = Boolean(active.located && isPlausibleSymbolBox(active));
          applyOccurrenceFocus(renderer, active, focusLevel(true, located), focusZoomRef.current);
        } else {
          renderer.focusExtent(extentRef.current, 28);
        }
        fittedRef.current = true;
        fittedSizeRef.current = { w: width, h: height };
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
        onDoubleClick: () => {
          renderer.focusExtent(extentRef.current, 28);
          drawRef.current();
        },
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
    const abort = new AbortController();
    abortRef.current = abort;
    let cancelled = false;
    const client = new CadEngineClient();
    void (async () => {
      try {
        setPhase('download');
        setPercent(null);
        const hostBytes = await readBytes(url, (ratio) => {
          if (!cancelled) setPercent(Math.round(ratio * 100));
        }, abort.signal);
        if (cancelled) return;
        const refs = backgroundKey
          .split('\n')
          .filter((row) => row.length > 0)
          .map((row) => {
            const [name, path] = row.split('\t');
            return { name: name ?? '', path: path || null };
          });
        setPhase('xref');
        setPercent(null);
        const deps: XrefDepBytes[] = [];
        let missing = refs.length > 0;
        for (const ref of refs) {
          try {
            const bytes = await readBytes(`${url}/background?name=${encodeURIComponent(ref.name)}`, undefined, abort.signal);
            for (const xrefPath of xrefDependencyPaths(ref.name, ref.path)) deps.push({ path: xrefPath, bytes });
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
        const architectural = new Set(displayArchitecturalLayerIndexes(layers, refs.map((ref) => ref.name)));
        layersRef.current = layers;
        setToolLayers(layers);
        setToolTexts((scene.texts ?? []).map((row) => ({ text: row.t, x: row.x, y: row.y, layer: row.layer })));
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
          texts: scene.texts ?? [],
        };
        setSheetSource({
          spaces: scene.spaces ?? [],
          layouts,
        });
        setPhase('ready');
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) return;
        const message = error instanceof Error ? error.message : '';
        if (message === 'source_missing') setPhase('missing');
        else if (message === 'source_unavailable') unavailableRef.current();
        else setPhase('error');
      } finally {
        client.dispose();
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
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
    const modelDrawing = {
      segments: model.segments,
      triangles: model.triangles,
      extent: modelViewExtent(
        model.contentExtent,
        marksRef.current.map((mark) => ({ x: mark.nativeX, y: mark.nativeY })),
        model.origin,
      ),
    };
    const drawing = planGeometryOrModel(
      current.kind,
      current.kind === 'model'
        ? modelDrawing
        : projectSegments({
            segments: model.segments,
            triangles: model.triangles,
            stride: model.stride,
            triangleStride: model.triangleStride,
            origin: model.origin,
            viewports: visible,
          }),
      model.segments,
      modelDrawing,
    );
    extentRef.current = drawing.extent;
    drawnRef.current = drawing.segments;
    const fitKey = `${current.id}:${current.kind}:${activeIds.join(',')}`;
    const shouldFitWhole = lastFitKeyRef.current !== fitKey;
    lastFitKeyRef.current = fitKey;
    if (shouldFitWhole) fittedRef.current = false;
    const layers = model.layers;
    void renderer.setDrawingAsync(
      drawing.segments,
      drawing.extent,
      layers,
      drawing.extent,
      drawing.triangles,
      model.stride,
    ).then(() => {
      if (cancelled) return;
      renderer.setArchitectureDisplay(architecturalRef.current, { mode: archModeRef.current, strength: archStrengthRef.current });
      if (shouldFitWhole) {
        const active = shownRef.current.find((item) => item.id === focusIdRef.current);
        if (active) {
          const located = Boolean(active.located && isPlausibleSymbolBox(active));
          applyOccurrenceFocus(renderer, active, focusLevel(true, located), focusZoomRef.current);
        } else {
          renderer.focusExtent(drawing.extent, 28);
        }
      }
      fittedRef.current = true;
      const rect = glRef.current?.getBoundingClientRect();
      fittedSizeRef.current = { w: rect?.width ?? 0, h: rect?.height ?? 0 };
      setViewToken((value) => value + 1);
      drawRef.current();
    });
    return () => {
      cancelled = true;
    };
  }, [activeIds, phase, sheet]);

  useEffect(() => {
    const model = modelRef.current;
    const renderer = rendererRef.current;
    const current = sheet;
    if (!model || !renderer || !current || phase !== 'ready' || viewToken === 0) return;
    const frame = placeMarks(current, activeIds, marks, model, drawnRef.current, focusId, architecturalRef.current);
    shownRef.current = frame;
    const active = frame.find((item) => item.id === focusId) ?? null;
    const located = Boolean(active?.located && isPlausibleSymbolBox(active));
    const level = focusLevel(Boolean(active), located);
    setFocused(focusId ? { id: focusId, level } : null);
    if (!focusId) {
      lastFocusKeyRef.current = '';
      drawRef.current();
      return;
    }
    if (!active || level === 'unavailable') {
      drawRef.current();
      return;
    }
    const focusKey = `${focusId}:${focusZoom}:${viewToken}:${current.id}:${level}`;
    if (lastFocusKeyRef.current !== focusKey) {
      lastFocusKeyRef.current = focusKey;
      applyOccurrenceFocus(renderer, active, level, focusZoom);
    }
    if (active.located && isPlausibleSymbolBox(active) && onSymbolGlyphs) {
      const source = marks.find((item) => item.id === active.id);
      const box = {
        half: Math.max(active.maxX - active.minX, active.maxY - active.minY, 1) / 2,
        minX: active.minX,
        minY: active.minY,
        maxX: active.maxX,
        maxY: active.maxY,
        located: true as const,
      };
      const svg = symbolGlyphSvg(
        symbolGlyphStrokes(drawnRef.current, box, architecturalRef.current),
        box,
        '#111827',
      );
      if (svg) {
        const next: Record<string, string> = { [active.id]: svg };
        if (source?.signature) next[`sig:${source.signature}`] = svg;
        onSymbolGlyphs(next);
      }
    }
    drawRef.current();
  }, [activeIds, focusId, focusZoom, marks, onSymbolGlyphs, phase, sheet, viewToken]);

  useEffect(() => {
    if (phase !== 'ready' || viewToken === 0 || !onSymbolGlyphs || !sheet) return;
    const model = modelRef.current;
    if (!model) return;
    const segments = drawnRef.current;
    const placed = marks.flatMap((mark) => {
      const point = toDisplay(mark.nativeX, mark.nativeY, sheet, activeIds, model);
      return point ? [{ ...mark, ...point }] : [];
    });
    const seen = new Set<string>();
    const glyphs: Record<string, string> = {};
    for (const mark of placed) {
      const key = mark.signature || mark.id;
      if (seen.has(key)) continue;
      seen.add(key);
      const box = symbolFrame(segments, mark.x, mark.y, placed, mark.id, architecturalRef.current);
      if (!isPlausibleSymbolBox(box)) continue;
      const svg = symbolGlyphSvg(symbolGlyphStrokes(segments, box, architecturalRef.current), box, '#111827');
      if (!svg) continue;
      glyphs[mark.id] = svg;
      if (mark.signature) glyphs[`sig:${mark.signature}`] = svg;
      if (Object.keys(glyphs).length >= 48) break;
    }
    if (Object.keys(glyphs).length > 0) onSymbolGlyphs(glyphs);
  }, [activeIds, marks, onSymbolGlyphs, phase, sheet, viewToken]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || phase !== 'ready' || viewToken === 0) return;
    renderer.setArchitectureDisplay(architecturalRef.current, {
      mode: archMode,
      strength: archStrength,
    });
  }, [archMode, archStrength, phase, viewToken]);

  useEffect(() => {
    const model = modelRef.current;
    const renderer = rendererRef.current;
    const canvas = textRef.current;
    const gl = glRef.current;
    if (!model || !renderer || !canvas || !gl || phase !== 'ready') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (canvas.width !== gl.width || canvas.height !== gl.height) {
      canvas.width = gl.width;
      canvas.height = gl.height;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const view = renderer.getView();
    const viewport = { width: canvas.width, height: canvas.height };
    for (const text of model.texts) {
      drawCadText(
        {
          ctx,
          view,
          viewport,
          origin: model.origin,
          fontFamily: '"Noto Sans Hebrew", Arial, sans-serif',
          plotView: false,
        },
        text,
        view.zoom,
      );
    }
  }, [phase, viewToken, sheet]);

  const tools = useCadTools({
    layers: toolLayers,
    xrefNames: backgroundRefs.map((ref) => ref.name),
    texts: toolTexts,
    sheets: (plan?.sheets ?? []).map((item) => ({ id: item.id, label: item.label })),
    blocks: backgroundRefs.map((ref) => ref.name),
    activeSheet: sheet?.id ?? '',
    tintSupported: true,
    automationSupported: true,
    documentId: sheetKey,
    showModeChooser: false,
    architectureMode: archMode,
    architectureStrength: archStrength,
    onLayers: (rows) => {
      const visible = new Map(rows.map((row) => [row.index, row.visible]));
      const next = toolLayers.map((layer) => {
        const value = visible.get(layer.index);
        return value === undefined ? layer : { ...layer, visible: value };
      });
      layersRef.current = next;
      setToolLayers(next);
      rendererRef.current?.applyLayerVisibility(next);
    },
    onArchitecture: (mode, strength) => {
      setArchMode(mode);
      setArchStrength(strength);
      backgroundRef.current = mode === 'hidden' ? 'hidden' : background === 'none' ? 'none' : 'shown';
      if (background === 'shown' || background === 'hidden') setBackground(mode === 'hidden' ? 'hidden' : 'shown');
    },
    onFocusWorld: (x, y) => {
      rendererRef.current?.focusExtent([x - 80, y - 80, x + 80, y + 80], 36);
      drawRef.current();
    },
    onSelectSheet: (id) => {
      setPickedFor(pickScope);
      setPickedSheetId(id);
      setWindowsFor(`${sheetKey}:${id}`);
      setPickedWindows([]);
    },
    readScene: () => {
      const canvas = glRef.current;
      const renderer = rendererRef.current;
      const model = modelRef.current;
      if (!canvas || !renderer || !model) return null;
      return {
        canvas,
        view: renderer.getView(),
        segments: drawnRef.current,
        stride: model.stride,
        marks: shownRef.current.map((mark) => ({ id: mark.id, x: mark.x, y: mark.y })),
      };
    },
  });
  const stacks = sheet?.stacks.filter((stack) => stack.length > 1) ?? [];
  const phaseLabel = phase === 'download'
    ? t('viewer.dwgDownloading')
    : phase === 'xref'
      ? t('viewer.dwgXref')
      : phase === 'parse'
        ? t('viewer.dwgParsing')
        : phase === 'prepare'
          ? t('viewer.dwgPreparing')
          : phase === 'missing'
            ? t('viewer.dwgMissing')
            : phase === 'error'
              ? t('viewer.dwgFailed')
              : null;
  const waitLabel = loadWait === 'long'
    ? t('viewer.dwgDelay')
    : loadWait === 'stuck'
      ? t('viewer.dwgStuck')
      : null;

  return (
    <div
      ref={hostRef}
      className="relative flex h-full min-h-0 w-full max-w-full flex-col overflow-hidden overflow-x-hidden bg-[#1e2124] lg:absolute lg:inset-0 lg:h-auto"
      data-testid="takeoff-dwg-plan"
      data-cad-space={sheet?.space ?? ''}
      data-cad-sheets={plan?.sheets.length ?? 0}
      data-load-phase={phase}
      data-focus-id={focused?.id ?? ''}
      data-cad-tree={PF_CAD_TREE_ID}
      data-focus-level={focused?.level ?? ''}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-white/10 p-1">
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
        <label className="flex min-w-0 max-w-full flex-wrap items-center gap-2 px-1 text-xs text-white">
          <span className="whitespace-nowrap">{t('viewer.symbolFocusZoom')}</span>
          <span className="text-white/70">{t('viewer.symbolFocusZoomWide')}</span>
          <input
            type="range"
            min={SYMBOL_FOCUS_ZOOM_MIN}
            max={SYMBOL_FOCUS_ZOOM_MAX}
            value={focusZoom}
            aria-label={t('viewer.symbolFocusZoom')}
            data-testid="takeoff-symbol-focus-zoom"
            className="min-h-11 w-28"
            onChange={(event) => {
              const next = writeStoredSymbolFocusZoom(Number(event.target.value));
              const renderer = rendererRef.current;
              const active = shownRef.current.find((item) => item.id === focusIdRef.current);
              if (!renderer || !active) return;
              const located = Boolean(active.located && isPlausibleSymbolBox(active));
              lastFocusKeyRef.current = '';
              applyOccurrenceFocus(renderer, active, focusLevel(true, located), next);
              drawRef.current();
            }}
          />
          <span className="text-white/70">{t('viewer.symbolFocusZoomClose')}</span>
          <span className="tabular-nums" data-testid="takeoff-symbol-focus-zoom-value">
            {t('viewer.symbolFocusZoomValue', { value: focusZoom })}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="min-h-8 px-2 text-xs"
            data-testid="takeoff-symbol-focus-zoom-reset"
            onClick={() => {
              const next = writeStoredSymbolFocusZoom(SYMBOL_FOCUS_ZOOM_DEFAULT);
              const renderer = rendererRef.current;
              const active = shownRef.current.find((item) => item.id === focusIdRef.current);
              if (!renderer || !active) return;
              const located = Boolean(active.located && isPlausibleSymbolBox(active));
              lastFocusKeyRef.current = '';
              applyOccurrenceFocus(renderer, active, focusLevel(true, located), next);
              drawRef.current();
            }}
          >
            {t('viewer.symbolFocusZoomReset')}
          </Button>
        </label>
        {phase === 'ready' && plan && plan.sheets.length > 1 ? (
          <label className="flex max-w-full items-center gap-2 text-xs text-white">
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
        {phase === 'ready' && stacks.length > 0 ? stacks.map((stack) => (
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
        )) : null}
        {background === 'shown' || background === 'hidden' ? (
          <label className="flex max-w-full items-center gap-2 text-xs text-white">
            <span>{t('viewer.backgroundMode')}</span>
            <select
              className="min-h-11 max-w-full rounded border border-white/20 bg-[#2a2e32] px-2"
              data-testid="takeoff-background-toggle"
              aria-label={t('viewer.backgroundMode')}
              value={archMode}
              onChange={(event) => {
                const mode = event.target.value as ArchitectureMode;
                setArchMode(mode);
                const next = mode === 'hidden' ? 'hidden' : 'shown';
                backgroundRef.current = next;
                setBackground(next);
              }}
            >
              <option value="original">{t('viewer.archOriginal')}</option>
              <option value="gray">{t('viewer.archGray')}</option>
              <option value="mono">{t('viewer.archMono')}</option>
              <option value="hidden">{t('viewer.archHidden')}</option>
            </select>
          </label>
        ) : null}
        {background !== 'none' && background !== 'missing' && archMode === 'gray' ? (
          <label className="flex items-center gap-2 text-xs text-white">
            <span>{t('viewer.archStrength')}</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(archStrength * 100)}
              aria-label={t('viewer.archStrength')}
              className="min-h-11 w-24"
              onChange={(event) => setArchStrength(Number(event.target.value) / 100)}
            />
          </label>
        ) : null}
        {background === 'missing' && phase === 'ready' ? (
          <span className="text-xs text-white/90" data-testid="takeoff-background-missing">{t('viewer.backgroundMissing')}</span>
        ) : null}
        <Button type="button" variant={toolsOpen ? 'primary' : 'secondary'} className="min-h-11 px-2" aria-expanded={toolsOpen} onClick={() => setToolsOpen((open) => !open)}>
          {t('viewer.tools')}
        </Button>
        {focused?.level === 'point' ? <span className="text-xs text-white/90" data-testid="takeoff-focus-point">{t('viewer.focusPoint')}</span> : null}
        {focused?.level === 'unavailable' ? <span className="text-xs text-white/90" data-testid="takeoff-focus-unavailable">{t('viewer.symbolUnlocated')}</span> : null}
      </div>
      {toolsOpen && phase === 'ready' ? (
        <div className="max-h-52 min-h-0 w-full shrink-0 overflow-x-hidden overflow-y-auto border-b border-white/10 bg-[#2a2e32] p-1.5 text-xs text-white">
          {tools.panel}
        </div>
      ) : null}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <canvas ref={glRef} className="absolute inset-0 size-full touch-none" aria-label={t('viewer.aria')} />
        <canvas ref={textRef} className="pointer-events-none absolute inset-0 size-full" data-testid="takeoff-text-canvas" />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 size-full" />
        {tools.overlay}
        {phaseLabel ? (
          <div className="absolute inset-x-2 top-2 z-10 flex flex-wrap items-center justify-center gap-2 text-center text-xs text-white/90">
            <p data-testid="takeoff-load-phase">
              {phaseLabel}
              {phase === 'download' && percent !== null ? ` ${percent}%` : ''}
              {waitLabel ? ` — ${waitLabel}` : ''}
            </p>
            {phase === 'download' || phase === 'xref' || phase === 'parse' ? (
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => { abortRef.current?.abort(); setPhase('error'); }}>
                {t('viewer.dwgCancel')}
              </Button>
            ) : null}
            {phase === 'error' || phase === 'missing' ? (
              <Button type="button" variant="secondary" className="min-h-11" onClick={() => setAttempt((value) => value + 1)}>
                {t('viewer.dwgRetry')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
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

async function readBytes(
  url: string,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'same-origin', signal });
  if (response.status === 404) throw new Error('source_missing');
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
