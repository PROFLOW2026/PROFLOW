'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CadDwgViewerToolbar } from './cad-dwg-viewer-toolbar';
import { cadViewportDevicePixelRatio } from './cad-viewport-dpr';
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
import { buildCadDwgBanners } from './cad-ui-messages';
import {
  registerCadOverlayFonts,
  resolveCadTextFontFamily,
} from './cad-dynamic-font-faces';
import { drawCadText } from './draw-cad-text';
import { drawCadRaster } from './draw-cad-raster';
import { findPlotCtbBytes } from './cad-plot-ctb';
import { clearCadShxFonts, lookupShxFont, registerCadShxFonts } from './cad-shx-registry';
import { createCadRenderer, type CadRendererHandle } from './pf-renderer-bridge';
import {
  mergeMissingFontsIntoReport,
  resolveCadFontsFromStorage,
} from './font-resolver';
import { buildStorageCadFileIndex } from './storage-cad-file-index';
import {
  buildFileIndex,
  lookupInIndex,
  normalizeCadPath,
  type CadIndexedFile,
} from './xref-resolver';
import type { ScenePayload } from './types';
import type { XrefDepBytes } from './xref-resolver';
import { yieldToMain } from './yield-to-main';

type DrawingPayload = {
  scene: ScenePayload;
  segments: Float32Array;
  triangles: Float32Array;
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

const PF_CAD_HEBREW_FONT_URL = '/pf-cad/fonts/NotoSansHebrew-Regular.ttf';
const PF_CAD_TEXT_FONT = '"Noto Sans Hebrew", Arial, sans-serif';

export function PfDwgViewer({
  url,
  fileName,
  reloadKey,
  onRetry,
  onOpenOnDevice,
  siblingFiles,
  scope,
  projectId,
  devCadIndexedFiles,
}: {
  url: string;
  fileName: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
  /** Dev-only: satisfy XREF/fonts without storage OAuth. */
  devCadIndexedFiles?: readonly CadIndexedFile[];
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
      devCadIndexedFiles={devCadIndexedFiles}
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
  devCadIndexedFiles,
}: {
  url: string;
  fileName: string;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  siblingFiles?: readonly ProviderFileItem[];
  scope: StorageBrowserScope;
  projectId?: string;
  devCadIndexedFiles?: readonly CadIndexedFile[];
}) {
  const locale = useLocale();
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
  const [compat, setCompat] = useState<ScenePayload['report'] | null>(null);
  const resolvedFontsRef = useRef<Awaited<
    ReturnType<typeof resolveCadFontsFromStorage>
  > | null>(null);
  const overlayFontMapRef = useRef<Map<string, string> | null>(null);
  const drawTextsRef = useRef<() => void>(() => {});
  const [spaces, setSpaces] = useState<string[]>([]);
  const [activeSpace, setActiveSpace] = useState('');
  const [plotView, setPlotView] = useState(false);
  const loadContextRef = useRef<{
    hostBytes: Uint8Array;
    fileIndex: ReturnType<typeof buildStorageCadFileIndex>;
  } | null>(null);
  /** Bumps when a new text pass starts; stale rAF slices exit without drawing. */
  const textDrawGenRef = useRef(0);
  const textSliceRafRef = useRef(0);
  const textScheduleRafRef = useRef(0);

  const fileIndex = useMemo(() => {
    if (devCadIndexedFiles && devCadIndexedFiles.length > 0) {
      return buildFileIndex([...devCadIndexedFiles]);
    }
    return buildStorageCadFileIndex({
      siblingFiles: siblingFiles ?? [],
      scope,
      projectId,
    });
  }, [devCadIndexedFiles, projectId, scope, siblingFiles]);

  const cancelTextDraw = useCallback(() => {
    cancelAnimationFrame(textSliceRafRef.current);
    cancelAnimationFrame(textScheduleRafRef.current);
    textDrawGenRef.current += 1;
  }, []);

  const scheduleTextRedraw = useCallback(() => {
    cancelAnimationFrame(textScheduleRafRef.current);
    textScheduleRafRef.current = requestAnimationFrame(() => drawTextsRef.current());
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
    const texts = d.scene.texts;
    let idx = 0;
    const TEXTS_PER_SLICE = 250;
    const styleMap = overlayFontMapRef.current;
    const drawCtx = {
      ctx,
      view,
      viewport,
      origin: d.scene.origin,
      fontFamily: PF_CAD_TEXT_FONT,
      styleFontFamily: (style: string | number | undefined) =>
        resolveCadTextFontFamily(style, styleMap, PF_CAD_TEXT_FONT),
      shxFont: (style: string | number | undefined) => lookupShxFont(style),
    };

    const drawSlice = () => {
      if (gen !== textDrawGenRef.current) return;
      const end = Math.min(texts.length, idx + TEXTS_PER_SLICE);
      for (; idx < end; idx += 1) {
        const tx = texts[idx]!;
        if (hidden.has(tx.layer) || tx.invisible) continue;
        drawCadText(drawCtx, tx, view.zoom);
      }
      if (idx < texts.length && gen === textDrawGenRef.current) {
        textSliceRafRef.current = requestAnimationFrame(drawSlice);
        return;
      }
      const images = d.scene.images ?? [];
      if (images.length === 0 || gen !== textDrawGenRef.current) return;
      const hostPath = normalizeCadPath(fileName);
      void (async () => {
        for (const img of images) {
          if (gen !== textDrawGenRef.current) return;
          if (hidden.has(img.layer)) continue;
          await drawCadRaster(
            {
              ctx,
              view,
              viewport,
              origin: d.scene.origin,
              resolveImageUrl: async (path) => {
                const hit = lookupInIndex(fileIndex, hostPath, path);
                if (!hit) return null;
                try {
                  const bytes = await hit.getBytes();
                  const blob = new Blob([bytes], { type: 'image/png' });
                  return URL.createObjectURL(blob);
                } catch {
                  return null;
                }
              },
            },
            img,
            view.zoom,
          );
        }
      })();
    };
    drawSlice();
  }, [cancelTextDraw, fileIndex, fileName]);

  drawTextsRef.current = drawTexts;

  useEffect(() => {
    const styleId = 'pf-cad-noto-hebrew-face';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `@font-face{font-family:"Noto Sans Hebrew";src:url("${PF_CAD_HEBREW_FONT_URL}") format("truetype");font-weight:400;font-style:normal;font-display:swap;}`;
      document.head.appendChild(style);
    }
  }, []);

  useEffect(() => {
    if (!glCanvasRef.current || !hostRef.current) return;
    setWebglError(null);
    try {
      rendererRef.current = createCadRenderer({
        canvas: glCanvasRef.current,
        onContextLost: () => setWebglError(safePreviewLabel(t, 'cadWebglRequired')),
        onAfterViewChange: scheduleTextRedraw,
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
      const dpr = cadViewportDevicePixelRatio();
      rendererRef.current.resize(width, height, dpr);
      drawTexts();
    });
    ro.observe(hostRef.current);

    const glCv = glCanvasRef.current;
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
  }, [cancelTextDraw, scheduleTextRedraw, t]);

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
        const fontResolve = await resolveCadFontsFromStorage({
          fonts: res.scene.report.fonts,
          hostPath: normalizeCadPath(fileName),
          fileIndex,
        });
        resolvedFontsRef.current = fontResolve;
        overlayFontMapRef.current = registerCadOverlayFonts(fontResolve.resolved);
        clearCadShxFonts();
        registerCadShxFonts(fontResolve.resolved);
        const reportWithFonts = mergeMissingFontsIntoReport(
          res.scene.report,
          fontResolve.missingFonts,
        );
        const scene: ScenePayload = { ...res.scene, report: reportWithFonts };
        const triangles = res.triangles ?? new Float32Array(0);
        const payload: DrawingPayload = { scene, segments: res.segments, triangles };
        drawingRef.current = payload;
        setSpaces(scene.spaces ?? []);
        setActiveSpace(scene.space ?? '');
        setUiLayers(cadLayersToUi(scene.layers));
        setCompat(reportWithFonts);
        cachedDepsRef.current = client.lastDeps;
        await yieldToMain();
        const tGpu0 = performance.now();
        const uiLayersInitial = cadLayersToUi(res.scene.layers);
        const fitExtent = scene.contentExtent ?? scene.robustExtent;
        await rendererRef.current?.setDrawingAsync(
          res.segments,
          fitExtent,
          uiLayersInitial,
          scene.fullExtent,
          triangles,
          scene.segmentStride,
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
  }, [devCadIndexedFiles, drawTexts, fileIndex, fileName, t, url]);

  const handleFitView = useCallback(() => {
    rendererRef.current?.fitFull();
  }, []);

  const handleZoomIn = useCallback(() => {
    rendererRef.current?.zoom(1.25);
  }, []);

  const handleZoomOut = useCallback(() => {
    rendererRef.current?.zoom(1 / 1.25);
  }, []);

  const handleSpaceChange = useCallback(
    (space: string) => {
      const ctx = loadContextRef.current;
      const client = clientRef.current;
      if (!ctx || !client) return;
      setLoading(true);
      setLoadingLabel(safePreviewLabel(t, 'cadLoadingParse'));
      void (async () => {
        try {
          const plotCtbBytes =
            plotView ? await findPlotCtbBytes(ctx.fileIndex, fileName) : undefined;
          const res = await client.parseDwgFromStorage({
            fileName,
            hostBytes: ctx.hostBytes,
            fileIndex: ctx.fileIndex,
            space,
            skipXrefClosure: true,
            cachedDeps: cachedDepsRef.current,
            plotMode: plotView,
            plotCtbBytes,
          });
          const fontResolve =
            resolvedFontsRef.current ??
            (await resolveCadFontsFromStorage({
              fonts: res.scene.report.fonts,
              hostPath: normalizeCadPath(fileName),
              fileIndex: ctx.fileIndex,
            }));
          const reportWithFonts = mergeMissingFontsIntoReport(
            res.scene.report,
            fontResolve.missingFonts,
          );
          const scene: ScenePayload = { ...res.scene, report: reportWithFonts };
          const triangles = res.triangles ?? new Float32Array(0);
          const payload: DrawingPayload = { scene, segments: res.segments, triangles };
          drawingRef.current = payload;
          setActiveSpace(scene.space ?? space);
          setUiLayers(cadLayersToUi(scene.layers));
          setCompat(reportWithFonts);
          await yieldToMain();
          const fitExtent = scene.contentExtent ?? scene.robustExtent;
          await rendererRef.current?.setDrawingAsync(
            res.segments,
            fitExtent,
            cadLayersToUi(scene.layers),
            scene.fullExtent,
            triangles,
            scene.segmentStride,
          );
          rendererRef.current?.fit();
          scheduleIdleDraw(() => drawTexts());
        } finally {
          setLoading(false);
        }
      })();
    },
    [drawTexts, fileName, plotView, t],
  );

  const handlePlotViewChange = useCallback(
    (on: boolean) => {
      const ctx = loadContextRef.current;
      const client = clientRef.current;
      if (!ctx || !client) {
        setPlotView(on);
        return;
      }
      setPlotView(on);
      setLoading(true);
      setLoadingLabel(safePreviewLabel(t, 'cadLoadingParse'));
      void (async () => {
        try {
          const plotCtbBytes = on ? await findPlotCtbBytes(ctx.fileIndex, fileName) : undefined;
          const res = await client.parseDwgFromStorage({
            fileName,
            hostBytes: ctx.hostBytes,
            fileIndex: ctx.fileIndex,
            space: activeSpace,
            skipXrefClosure: true,
            cachedDeps: cachedDepsRef.current,
            plotMode: on,
            plotCtbBytes,
          });
          const fontResolve = resolvedFontsRef.current;
          const reportWithFonts = mergeMissingFontsIntoReport(
            res.scene.report,
            fontResolve?.missingFonts ?? [],
          );
          const scene: ScenePayload = { ...res.scene, report: reportWithFonts };
          const triangles = res.triangles ?? new Float32Array(0);
          drawingRef.current = { scene, segments: res.segments, triangles };
          setUiLayers(cadLayersToUi(scene.layers));
          setCompat(reportWithFonts);
          await yieldToMain();
          const fitExtent = scene.contentExtent ?? scene.robustExtent;
          await rendererRef.current?.setDrawingAsync(
            res.segments,
            fitExtent,
            cadLayersToUi(scene.layers),
            scene.fullExtent,
            triangles,
            scene.segmentStride,
          );
          rendererRef.current?.draw();
          scheduleIdleDraw(() => drawTexts());
        } finally {
          setLoading(false);
        }
      })();
    },
    [activeSpace, drawTexts, fileName, t],
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

  const dwgBanners = useMemo(
    () => (compat ? buildCadDwgBanners(compat, activeSpace) : []),
    [activeSpace, compat],
  );

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
    <div
      ref={hostRef}
      className={`relative flex min-h-0 flex-1 flex-col ${plotView ? 'bg-white' : 'bg-[#0a0e14]'}`}
    >
      {loading ? (
        <StorageLoadingOverlay label={loadingLabel} progress={loadingProgress} blocking />
      ) : null}
      <CadPreviewChrome
        hostRef={hostRef}
        layersPanel={layersPanel}
        onFitView={handleFitView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      >
        <div className="relative size-full">
          <CadDwgViewerToolbar
            spaces={spaces}
            activeSpace={activeSpace}
            onSpaceChange={handleSpaceChange}
            banners={dwgBanners}
            locale={locale}
            plotView={plotView}
            onPlotViewChange={handlePlotViewChange}
          />
          <canvas
            ref={glCanvasRef}
            className="absolute inset-0 size-full touch-none"
            aria-label={t('cadViewerCanvas')}
          />
          <canvas
            ref={textCanvasRef}
            className="pointer-events-none absolute inset-0 size-full"
            data-testid="pf-cad-text-canvas"
            aria-hidden
          />
        </div>
      </CadPreviewChrome>
    </div>
  );
}
