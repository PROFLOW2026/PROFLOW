'use client';

import {
  ChevronLeft,
  ChevronRight,
  Hand,
  Maximize,
  Minimize,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCw,
  Scan,
  Square,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/shared/ui/cn';
import { PdfLazyPage } from './pdf-lazy-page';
import { PDFJS_WORKER_PUBLIC_PATH } from './pdf-viewer-config';
import { StorageLoadingOverlay } from './storage-loading-overlay';
import {
  PDF_LOAD_TIMEOUT_MS,
  PDF_PINCH_COMMIT_MS,
  PDF_ZOOM_PRESETS,
  clampPdfZoom,
  computePdfPageWidth,
  computePdfZoomPercent,
  createPdfPreviewTimings,
  elapsedMs,
  readDevicePixelRatio,
  zoomPresetToPercent,
  type PdfFitMode,
  type PdfPreviewTimings,
} from './pdf-viewer-utils';

pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PUBLIC_PATH;

export function PdfJsViewer({
  url,
  reloadKey,
  onRetry,
}: {
  url: string;
  reloadKey: number;
  onRetry: () => void;
}) {
  const t = useTranslations('externalStorage.preview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchCommitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null,
  );
  const gestureScaleRef = useRef(1);
  const timingsRef = useRef<PdfPreviewTimings>(createPdfPreviewTimings());
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [containerWidth, setContainerWidth] = useState(640);
  const [containerHeight, setContainerHeight] = useState(480);
  const [fitMode, setFitMode] = useState<PdfFitMode>('width');
  const [zoomFactor, setZoomFactor] = useState(1);
  const [gestureScale, setGestureScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
  const [handToolActive, setHandToolActive] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [documentLoading, setDocumentLoading] = useState(true);
  const [pageAspect, setPageAspect] = useState(1.414);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [devicePixelRatio, setDevicePixelRatio] = useState(1);

  const pageWidth = useMemo(
    () =>
      computePdfPageWidth({
        fitMode,
        containerWidth,
        containerHeight,
        pageAspect,
        zoomFactor,
      }),
    [containerHeight, containerWidth, fitMode, pageAspect, zoomFactor],
  );

  const zoomPercent = useMemo(
    () => computePdfZoomPercent({ containerWidth, pageWidth }),
    [containerWidth, pageWidth],
  );

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const failLoad = useCallback(
    (message?: string) => {
      clearLoadTimeout();
      setDocumentLoading(false);
      setLoadError(message ?? t('failed'));
    },
    [clearLoadTimeout, t],
  );

  const commitGestureZoom = useCallback(() => {
    const scale = gestureScaleRef.current;
    if (scale === 1) return;
    setZoomFactor((current) => clampPdfZoom(current * scale));
    setGestureScale(1);
    gestureScaleRef.current = 1;
    setFitMode('custom');
  }, []);

  const applyZoomPreset = useCallback((fraction: number) => {
    setFitMode('custom');
    setGestureScale(1);
    gestureScaleRef.current = 1;
    setZoomFactor(clampPdfZoom(fraction));
  }, []);

  useEffect(() => {
    setScrollRoot(scrollRef.current);
    setDevicePixelRatio(readDevicePixelRatio());
  }, []);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setContainerWidth(Math.max(240, entry.contentRect.width - 16));
      setContainerHeight(Math.max(240, entry.contentRect.height - 16));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    timingsRef.current = createPdfPreviewTimings();
    setLoadError(null);
    setDocumentLoading(true);
    setNumPages(0);
    setCurrentPage(1);
    setPageInput('1');
    setFitMode('width');
    setZoomFactor(1);
    setGestureScale(1);
    setIsPinching(false);
    setHandToolActive(false);
    setRotation(0);
    clearLoadTimeout();

    loadTimeoutRef.current = setTimeout(() => {
      failLoad(t('failed'));
    }, PDF_LOAD_TIMEOUT_MS);

    return () => {
      clearLoadTimeout();
      if (pinchCommitRef.current) clearTimeout(pinchCommitRef.current);
    };
  }, [url, reloadKey, clearLoadTimeout, failLoad, t]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target) return;
        const page = Number((visible.target as HTMLElement).dataset.page);
        if (Number.isFinite(page)) setCurrentPage(page);
      },
      { root, threshold: [0.35, 0.55, 0.75] },
    );

    for (const node of pageRefs.current.values()) observer.observe(node);
    return () => observer.disconnect();
  }, [numPages, pageWidth, rotation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (event: TouchEvent) => {
      if (handToolActive) return;
      if (event.touches.length !== 2) return;
      const [a, b] = [event.touches[0]!, event.touches[1]!];
      pinchRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: gestureScale,
      };
      setIsPinching(true);
      setFitMode('custom');
      if (pinchCommitRef.current) clearTimeout(pinchCommitRef.current);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (handToolActive) return;
      if (event.touches.length !== 2 || !pinchRef.current) return;
      event.preventDefault();
      const [a, b] = [event.touches[0]!, event.touches[1]!];
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const next = Math.min(4, Math.max(0.25, (pinchRef.current.zoom * distance) / pinchRef.current.distance));
      gestureScaleRef.current = next;
      setGestureScale(next);
    };

    const onTouchEnd = () => {
      if (!pinchRef.current) return;
      pinchRef.current = null;
      setIsPinching(false);
      if (pinchCommitRef.current) clearTimeout(pinchCommitRef.current);
      pinchCommitRef.current = setTimeout(() => {
        commitGestureZoom();
      }, PDF_PINCH_COMMIT_MS);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [commitGestureZoom, gestureScale, handToolActive]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === scrollRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const scrollToPage = useCallback((page: number) => {
    const node = pageRefs.current.get(page);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }, []);

  const commitPageInput = useCallback(() => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed) || numPages <= 0) {
      setPageInput(String(currentPage));
      return;
    }
    const clamped = Math.min(numPages, Math.max(1, parsed));
    scrollToPage(clamped);
  }, [currentPage, numPages, pageInput, scrollToPage]);

  const onDocumentLoadSuccess = ({ numPages: total }: { numPages: number }) => {
    clearLoadTimeout();
    setLoadError(null);
    setDocumentLoading(false);
    setNumPages(total);
    timingsRef.current.documentLoadedAt = performance.now();
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('[PdfJsViewer] document load failed', error);
    failLoad(t('failed'));
  };

  const onFirstPageRendered = useCallback(() => {
    const timings = timingsRef.current;
    if (timings.firstPageRenderedAt) return;
    timings.firstPageRenderedAt = performance.now();
    if (process.env.NODE_ENV === 'development') {
      console.info('[PdfJsViewer] timings (ms)', {
        documentLoad: timings.documentLoadedAt
          ? elapsedMs(timings.openedAt, timings.documentLoadedAt)
          : null,
        firstPageRender: elapsedMs(timings.openedAt, timings.firstPageRenderedAt),
      });
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const node = scrollRef.current;
    if (!node) return;
    if (document.fullscreenElement === node) {
      await document.exitFullscreen();
      return;
    }
    await node.requestFullscreen();
  }, []);

  const onPanMouseDown = (event: React.MouseEvent) => {
    if (!handToolActive || event.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;
    event.preventDefault();
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    };
    setIsPanning(true);
  };

  const onPanMouseMove = (event: React.MouseEvent) => {
    if (!panRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    event.preventDefault();
    const dx = event.clientX - panRef.current.x;
    const dy = event.clientY - panRef.current.y;
    el.scrollLeft = panRef.current.scrollLeft - dx;
    el.scrollTop = panRef.current.scrollTop - dy;
  };

  const endPan = () => {
    panRef.current = null;
    setIsPanning(false);
  };

  const fileSource = useMemo(
    () => ({ url, withCredentials: true as const }),
    [url],
  );

  const documentKey = `${url}:${reloadKey}`;
  const visualScale = gestureScale;
  const showLoadingOverlay = documentLoading && !loadError;

  const toolbarControls = (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="hidden sm:inline-flex"
        onClick={() => {
          setFitMode('custom');
          setGestureScale(1);
          setZoomFactor((z) => clampPdfZoom(z - 0.25));
        }}
      >
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">{t('zoomOut')}</span>
      </Button>
      <Select
        value="custom"
        onValueChange={(value) => {
          const fraction = Number(value);
          if (Number.isFinite(fraction)) applyZoomPreset(fraction);
        }}
      >
        <SelectTrigger className="h-8 w-[5.5rem] text-xs" aria-label={t('zoomLevel')}>
          <SelectValue>{nearestZoomLabel(zoomPercent)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PDF_ZOOM_PRESETS.map((preset) => (
            <SelectItem key={preset} value={String(preset)}>
              {zoomPresetToPercent(preset)}%
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="hidden sm:inline-flex"
        onClick={() => {
          setFitMode('custom');
          setGestureScale(1);
          setZoomFactor((z) => clampPdfZoom(z + 0.25));
        }}
      >
        <Plus className="size-4" aria-hidden />
        <span className="sr-only">{t('zoomIn')}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={handToolActive ? 'primary' : 'secondary'}
        className="hidden md:inline-flex"
        onClick={() => setHandToolActive((active) => !active)}
        aria-pressed={handToolActive}
      >
        <Hand className="size-4" aria-hidden />
        <span className="hidden lg:inline">{t('handTool')}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          setFitMode('width');
          setGestureScale(1);
          setZoomFactor(1);
        }}
      >
        <Scan className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('fitWidth')}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          setFitMode('page');
          setGestureScale(1);
          setZoomFactor(1);
        }}
      >
        <Square className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('fitPage')}</span>
      </Button>
      {numPages > 0 ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage <= 1}
            onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only">{t('previous')}</span>
          </Button>
          <Input
            className="h-8 w-12 px-1 text-center text-xs tabular-nums sm:w-14"
            inputMode="numeric"
            value={pageInput}
            aria-label={t('pageNumber')}
            onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ''))}
            onBlur={commitPageInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPageInput();
            }}
          />
          <span className="text-sm text-[var(--pf-text-secondary)]">/ {numPages}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={currentPage >= numPages}
            onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
          >
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">{t('next')}</span>
          </Button>
        </>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="secondary" className="md:hidden" aria-label={t('more')}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setHandToolActive((active) => !active)}>
            {t('handTool')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRotation((r) => (r + 90) % 360)}>
            {t('rotate')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void toggleFullscreen()}>
            {isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setFitMode('custom');
              setZoomFactor((z) => clampPdfZoom(z - 0.25));
            }}
          >
            {t('zoomOut')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              setFitMode('custom');
              setZoomFactor((z) => clampPdfZoom(z + 0.25));
            }}
          >
            {t('zoomIn')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => applyZoomPreset(1)}>{t('reset')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="hidden md:inline-flex"
        onClick={() => setRotation((r) => (r + 90) % 360)}
      >
        <RotateCw className="size-4" aria-hidden />
        <span className="sr-only">{t('rotate')}</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="hidden md:inline-flex"
        onClick={() => void toggleFullscreen()}
      >
        {isFullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
        <span className="sr-only">{isFullscreen ? t('exitFullscreen') : t('fullscreen')}</span>
      </Button>
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-[var(--pf-border-default)] px-2 py-2">
        {toolbarControls}
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
          isPinching ? 'touch-none' : 'touch-pan-x touch-pan-y',
          handToolActive && 'cursor-grab',
          isPanning && 'cursor-grabbing select-none',
        )}
        onMouseDown={onPanMouseDown}
        onMouseMove={onPanMouseMove}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        {showLoadingOverlay ? <StorageLoadingOverlay label={t('loading')} /> : null}

        {loadError ? (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-4">
            <Alert tone="danger">{loadError}</Alert>
            <Button type="button" variant="secondary" onClick={onRetry}>
              {t('retry')}
            </Button>
          </div>
        ) : (
          <Document
            key={documentKey}
            file={fileSource}
            suspense={false}
            loading={<span className="sr-only">{t('loading')}</span>}
            error={
              <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-4">
                <Alert tone="danger">{t('failed')}</Alert>
                <Button type="button" variant="secondary" onClick={onRetry}>
                  {t('retry')}
                </Button>
              </div>
            }
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            className="flex flex-col items-center gap-4 px-2 py-4"
          >
            <div
              className="flex w-full flex-col items-center gap-4 origin-top"
              style={
                visualScale !== 1
                  ? { transform: `scale(${visualScale})`, transformOrigin: 'top center' }
                  : undefined
              }
            >
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1;
                return (
                  <div
                    key={`${pageNumber}:${Math.round(pageWidth)}:${devicePixelRatio}:${rotation}`}
                    ref={(node) => {
                      if (node) pageRefs.current.set(pageNumber, node);
                      else pageRefs.current.delete(pageNumber);
                    }}
                    data-page={pageNumber}
                  >
                    <PdfLazyPage
                      pageNumber={pageNumber}
                      pageWidth={pageWidth}
                      pageAspect={pageAspect}
                      devicePixelRatio={devicePixelRatio}
                      rotation={rotation}
                      eager={pageNumber === 1}
                      scrollRoot={scrollRoot}
                      loadingLabel={t('loading')}
                      onFirstPageMetrics={onFirstPageRendered}
                      onPageAspect={setPageAspect}
                    />
                  </div>
                );
              })}
            </div>
          </Document>
        )}
      </div>
    </div>
  );
}

function nearestZoomLabel(percent: number): string {
  return `${percent}%`;
}
