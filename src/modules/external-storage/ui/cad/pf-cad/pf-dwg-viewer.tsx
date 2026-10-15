'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CadDwgSpaceSelect } from './cad-dwg-space-select';
import type { ProviderFileItem } from '@/modules/external-storage/domain/types';
import type { StorageBrowserScope } from '@/modules/external-storage/client/storage-file-urls';
import { StorageLoadingOverlay } from '../../storage-loading-overlay';
import { CadPreviewChrome } from '../cad-preview-chrome';
import { fetchStoragePreviewBytes } from '../fetch-storage-preview-bytes';
import {
  applyUiLayerVisibility,
  cadLayersToUi,
  type UiLayer,
} from './cad-layers';
import { attachCadViewportInteraction } from './cad-viewport-interaction';
import { CadEngineClient, type CadLoadTimings, type ParseProgress } from './cad-engine-client';
import { createCadRenderer, type CadRendererHandle } from './pf-renderer-bridge';
import { worldToScreen } from './renderer';
import { buildStorageCadFileIndex } from './storage-cad-file-index';
import type { CompatReport, ScenePayload } from './types';
import type { XrefDepBytes } from './xref-resolver';
import { yieldToMain } from './yield-to-main';

type DrawingPayload = {
  scene: ScenePayload;
  segments: Float32Array;
};

const CAD_PREVIEW_LABELS = {
  cadLoadingDownload: 'Downloading drawing…',
  cadLoadingWasm: 'Loading DWG engine…',
  cadLoadingXref: 'Resolving drawing references (XREF)…',
  cadLoadingParse: 'Building drawing view…',
  cadWebglRequired: 'WebGL2 is required to preview this DWG in the browser.',
  cadLoadFailed: 'Could not display this CAD file.',
  cadEmptyDrawing: 'The file loaded but contains no displayable drawing content.',
} as const;

type PreviewTranslator = ((key: string) => string) & {
  has?: (key: string) => boolean;
};

function safePreviewLabel(
  t: PreviewTranslator,
  key: keyof typeof CAD_PREVIEW_LABELS,
): string {
  const fallback = CAD_PREVIEW_LABELS[key];
  try {
    if (typeof t.has === 'function' && !t.has(key)) {
      return fallback;
    }
    const value = t(key);
    if (!value || value.includes('MISSING_MESSAGE') || value.startsWith('[missing:')) {
      return fallback;
    }
    return value;
  } catch {
    return fallback;
  }
}

/** Download phase — uses `cadLoadingDownload` when present, else shared `loading`. */
function downloadLoadingLabel(t: PreviewTranslator): string {
  if (typeof t.has === 'function' && t.has('cadLoadingDownload')) {
    return safePreviewLabel(t, 'cadLoadingDownload');
  }
  if (typeof t.has === 'function' && t.has('loading')) {
    try {
      return t('loading');
    } catch {
      return CAD_PREVIEW_LABELS.cadLoadingDownload;
    }
  }
  return CAD_PREVIEW_LABELS.cadLoadingDownload;
}

function scheduleIdleDraw(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 2_500 });
  } else {
    requestAnimationFrame(fn);
  }
}

function unresolvedXrefCount(report: CompatReport): number {
  const total = Object.keys(report.xrefs).length;
  if (total === 0) return 0;
  const resolved = report.resolvedXrefs ?? 0;
  return Math.max(0, total - resolved);
}

export function PfDwgViewer({
  url,
  fileName,
  reloadKey,
  onRetry,
  onOpenOnDevice,
  siblingFiles,
  scope,
  projectId,
}: {
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
}) {
  return (
    <PfDwgViewerInner
      key={`${url}:${reloadKey}`}
      url={url}
      fileName={fileName}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
      siblingFiles={siblingFiles}
      scope={scope}
      projectId={projectId}
    />
  );
}

function PfDwgViewerInner({
  url,
  fileName,
  onRetry,
  onOpenOnDevice,
  siblingFiles,
  scope,
  projectId,
}: {
  url: string;
  fileName: string;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
}) {
  const t = useTranslations('externalStorage.preview');
  const hostRef = useRef<HTMLDivElement>(null);
  const glCanvasRef = useRef<HTMLCanvasElement>(null);
  const textCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CadRendererHandle | null>(null);
  const drawingRef = useRef<DrawingPayload | null>(null);
  const clientRef = useRef<CadEngineClient | null>(null);
  const cachedDepsRef = useRef<XrefDepBytes[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingLabel, setLoadingLabel] = useState(() =>
    safePreviewLabel(t, 'cadLoadingWasm'),
  );
  const loadTimingsRef = useRef<CadLoadTimings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [uiLayers, setUiLayers] = useState<UiLayer[]>([]);
  const [compat, setCompat] = useState<CompatReport | null>(null);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [activeSpace, setActiveSpace] = useState('');
  const loadContextRef = useRef<{
    hostBytes: Uint8Array;
    fileIndex: ReturnType<typeof buildStorageCadFileIndex>;
  } | null>(null);
  /** Bumps when a new text pass starts; stale rAF slices exit without drawing. */
  const textDrawGenRef = useRef(0);
  const textSliceRafRef = useRef(0);
  const textScheduleRafRef = useRef(0);

  const fileIndex = useMemo(
    () =>
      buildStorageCadFileIndex({
        siblingFiles: siblingFiles ?? [],
        scope,
        projectId,
      }),
    [projectId, scope, siblingFiles],
  );

  const cancelTextDraw = useCallback(() => {
    cancelAnimationFrame(textSliceRafRef.current);
    cancelAnimationFrame(textScheduleRafRef.current);
    textDrawGenRef.current += 1;
  }, []);

  const drawTexts = useCallback(() => {
    cancelTextDraw();
    const gen = textDrawGenRef.current;
    const d = drawingRef.current;
    const textCv = textCanvasRef.current;
    const glCv = glCanvasRef.current;
    const r = rendererRef.current;
    if (!d || !textCv || !glCv || !r) return;
    const ctx = textCv.getContext('2d');
    if (!ctx) return;
    const w = glCv.width;
    const h = glCv.height;
    textCv.width = w;
    textCv.height = h;
    ctx.clearRect(0, 0, w, h);
    const glRenderer = r.getRenderer();
    const view = glRenderer.getView();
    const viewport = { width: w, height: h };
    const hidden = new Set<number>();
    for (const layer of d.scene.layers) {
      if (layer.off || layer.frozen) hidden.add(layer.i);
    }
    const [ox, oy] = d.scene.origin;
    const texts = d.scene.texts;
    let idx = 0;
    const TEXTS_PER_SLICE = 250;

    const drawSlice = () => {
      if (gen !== textDrawGenRef.current) return;
      const end = Math.min(texts.length, idx + TEXTS_PER_SLICE);
      for (; idx < end; idx += 1) {
        const tx = texts[idx]!;
        if (hidden.has(tx.layer)) continue;
        const [sx, sy] = worldToScreen(tx.x - ox, tx.y - oy, view, viewport);
        const hpx = tx.h * view.zoom;
        if (hpx < 2) continue;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(-tx.r);
        ctx.fillStyle = `#${(tx.c >>> 0).toString(16).padStart(6, '0')}`;
        ctx.font = `${hpx * 1.35}px "Noto Sans Hebrew", Arial, sans-serif`;
        ctx.direction = 'ltr';
        ctx.fillText(tx.t, 0, 0);
        ctx.restore();
      }
      if (idx < texts.length && gen === textDrawGenRef.current) {
        textSliceRafRef.current = requestAnimationFrame(drawSlice);
      }
    };
    drawSlice();
  }, [cancelTextDraw]);

  useEffect(() => {
    if (!glCanvasRef.current || !hostRef.current) return;
    setWebglError(null);
    try {
      rendererRef.current = createCadRenderer({
        canvas: glCanvasRef.current,
        onContextLost: () => setWebglError(safePreviewLabel(t, 'cadWebglRequired')),
      });
    } catch (e) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surface WebGL init failure once
      setWebglError(
        e instanceof Error ? e.message : safePreviewLabel(t, 'cadWebglRequired'),
      );
    }

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !rendererRef.current) return;
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      rendererRef.current.resize(width, height, dpr);
      drawTexts();
    });
    ro.observe(hostRef.current);

    const glCv = glCanvasRef.current;
    const scheduleTextRedraw = () => {
      cancelAnimationFrame(textScheduleRafRef.current);
      textScheduleRafRef.current = requestAnimationFrame(() => drawTexts());
    };
    const detachNav = attachCadViewportInteraction(glCv, {
      panBy: (dx, dy) => rendererRef.current?.panBy(dx, dy),
      zoomAt: (sx, sy, factor) => rendererRef.current?.zoomAt(sx, sy, factor),
      onAfterViewChange: scheduleTextRedraw,
    });

    return () => {
      ro.disconnect();
      detachNav();
      cancelTextDraw();
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
  }, [cancelTextDraw, drawTexts, t]);

  useEffect(() => {
    let cancelled = false;
    clientRef.current?.dispose();
    clientRef.current = null;
    drawingRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset preview when url/file index changes
    setLoading(true);
    setLoadingProgress(0);
    setLoadingLabel(downloadLoadingLabel(t));
    loadTimingsRef.current = null;
    setError(null);
    setUiLayers([]);
    setCompat(null);
    setSpaces([]);
    setActiveSpace('');
    loadContextRef.current = null;
    cachedDepsRef.current = [];

    const loadStarted = performance.now();
    let progressRaf = 0;
    let pendingProgress: ParseProgress | null = null;
    const client = new CadEngineClient({
      onProgress: (p) => {
        pendingProgress = p;
        cancelAnimationFrame(progressRaf);
        progressRaf = requestAnimationFrame(() => {
          const snap = pendingProgress;
          if (!snap) return;
          setLoadingProgress(snap.ratio);
          if (snap.phase === 'wasm') setLoadingLabel(safePreviewLabel(t, 'cadLoadingWasm'));
          else if (snap.phase === 'xref') {
            const detail = snap.detail ? ` (${snap.detail})` : '';
            setLoadingLabel(`${safePreviewLabel(t, 'cadLoadingXref')}${detail}`);
          } else if (snap.phase === 'parse' || snap.phase === 'gpu') {
            setLoadingLabel(safePreviewLabel(t, 'cadLoadingParse'));
          }
        });
      },
      onTimings: (timings) => {
        loadTimingsRef.current = timings;
      },
      onError: (message) => {
        if (cancelled) return;
        setError(message);
        setLoading(false);
      },
    });
    clientRef.current = client;

    void (async () => {
      try {
        const tHost0 = performance.now();
        setLoadingLabel(downloadLoadingLabel(t));
        setLoadingProgress(0.04);
        const hostBytes = new Uint8Array(await fetchStoragePreviewBytes(url));
        const downloadHostMs = performance.now() - tHost0;
        if (cancelled) return;
        loadContextRef.current = { hostBytes, fileIndex };
        const res = await client.parseDwgFromStorage({
          fileName,
          hostBytes,
          fileIndex,
        });
        if (cancelled) return;
        const payload: DrawingPayload = { scene: res.scene, segments: res.segments };
        drawingRef.current = payload;
        setSpaces(res.scene.spaces ?? []);
        setActiveSpace(res.scene.space ?? '');
        setUiLayers(cadLayersToUi(res.scene.layers));
        setCompat(res.scene.report);
        cachedDepsRef.current = client.lastDeps;
        await yieldToMain();
        const tGpu0 = performance.now();
        const uiLayersInitial = cadLayersToUi(res.scene.layers);
        await rendererRef.current?.setDrawingAsync(
          res.segments,
          res.scene.robustExtent,
          uiLayersInitial,
        );
        rendererRef.current?.fit();
        rendererRef.current?.draw();
        const timeToFirstFrameMs = performance.now() - loadStarted;
        const gpuMs = performance.now() - tGpu0;
        if (loadTimingsRef.current) {
          loadTimingsRef.current = {
            ...loadTimingsRef.current,
            downloadHostMs,
            timeToFirstFrameMs,
          };
        }
        if (process.env.NODE_ENV === 'development') {
          console.info('[pf-cad] load timings', {
            ...loadTimingsRef.current,
            gpuMs,
          });
        }
        setLoadingProgress(1);
        setLoading(false);
        scheduleIdleDraw(() => drawTexts());
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(
          message === 'empty_drawing'
            ? safePreviewLabel(t, 'cadEmptyDrawing')
            : message.includes('MISSING_MESSAGE')
              ? safePreviewLabel(t, 'cadLoadFailed')
              : message || safePreviewLabel(t, 'cadLoadFailed'),
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(progressRaf);
      client.dispose();
      clientRef.current = null;
      drawingRef.current = null;
      loadContextRef.current = null;
      cachedDepsRef.current = [];
    };
  }, [drawTexts, fileIndex, fileName, t, url]);

  const handleFitView = useCallback(() => {
    rendererRef.current?.fit();
    drawTexts();
  }, [drawTexts]);

  const handleZoomIn = useCallback(() => {
    rendererRef.current?.zoom(1.25);
    drawTexts();
  }, [drawTexts]);

  const handleZoomOut = useCallback(() => {
    rendererRef.current?.zoom(1 / 1.25);
    drawTexts();
  }, [drawTexts]);

  const handleSpaceChange = useCallback(
    (space: string) => {
      const ctx = loadContextRef.current;
      const client = clientRef.current;
      if (!ctx || !client) return;
      setLoading(true);
      setLoadingLabel(safePreviewLabel(t, 'cadLoadingParse'));
      void (async () => {
        try {
          const res = await client.parseDwgFromStorage({
            fileName,
            hostBytes: ctx.hostBytes,
            fileIndex: ctx.fileIndex,
            space,
            skipXrefClosure: true,
            cachedDeps: cachedDepsRef.current,
          });
          const payload: DrawingPayload = { scene: res.scene, segments: res.segments };
          drawingRef.current = payload;
          setActiveSpace(res.scene.space ?? space);
          setUiLayers(cadLayersToUi(res.scene.layers));
          setCompat(res.scene.report);
          await yieldToMain();
          await rendererRef.current?.setDrawingAsync(res.segments, res.scene.robustExtent);
          rendererRef.current?.fit();
          scheduleIdleDraw(() => drawTexts());
        } finally {
          setLoading(false);
        }
      })();
    },
    [drawTexts, fileName, t],
  );

  const toggleLayer = useCallback(
    (layerIndex: number, visible: boolean) => {
      rendererRef.current?.setLayerVisibility(String(layerIndex), visible);
      setUiLayers((rows) =>
        rows.map((row) => (row.index === layerIndex ? { ...row, visible } : row)),
      );
      if (drawingRef.current) {
        drawingRef.current = {
          ...drawingRef.current,
          scene: {
            ...drawingRef.current.scene,
            layers: applyUiLayerVisibility(
              drawingRef.current.scene.layers,
              layerIndex,
              visible,
            ),
          },
        };
      }
      drawTexts();
    },
    [drawTexts],
  );

  const xrefMissing = compat ? unresolvedXrefCount(compat) : 0;

  const layersPanel =
    uiLayers.length > 0 ? (
      <ul className="space-y-2 text-sm">
        {uiLayers.map((layer) => (
          <li key={layer.id} className="flex items-center gap-2">
            <Checkbox
              id={`pf-layer-${layer.id}`}
              checked={layer.visible}
              disabled={layer.frozen}
              onCheckedChange={(checked) => toggleLayer(layer.index, checked === true)}
            />
            <Label htmlFor={`pf-layer-${layer.id}`} className="truncate font-normal">
              {layer.name}
              {layer.frozen ? ` (${t('cadLayerFrozen')})` : ''}
            </Label>
          </li>
        ))}
      </ul>
    ) : null;

  if (error || webglError) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-4">
        <Alert tone="danger">{error ?? webglError}</Alert>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" onClick={onRetry}>
            {t('retry')}
          </Button>
          {onOpenOnDevice ? (
            <Button type="button" variant="primary" onClick={onOpenOnDevice}>
              {t('openOnDevice')}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="relative flex min-h-0 flex-1 flex-col bg-[#0a0e14]">
      {loading ? (
        <StorageLoadingOverlay label={loadingLabel} progress={loadingProgress} blocking />
      ) : null}
      <CadPreviewChrome
        hostRef={hostRef}
        disclaimer={t('cadDwgPartialNotice')}
        layersPanel={layersPanel}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      >
        <div className="relative size-full">
          <div className="absolute inset-x-0 top-0 z-10 flex flex-col gap-1 px-2 py-1">
            <CadDwgSpaceSelect
              spaces={spaces}
              value={activeSpace}
              onValueChange={handleSpaceChange}
            />
            {xrefMissing > 0 ? (
              <Alert tone="warning">{t('cadXrefMissing', { count: xrefMissing })}</Alert>
            ) : null}
          </div>
          <canvas
            ref={glCanvasRef}
            className="absolute inset-0 size-full touch-none"
            aria-label={t('cadViewerCanvas')}
          />
          <canvas
            ref={textCanvasRef}
            className="pointer-events-none absolute inset-0 size-full"
            aria-hidden
          />
        </div>
      </CadPreviewChrome>
    </div>
  );
}
