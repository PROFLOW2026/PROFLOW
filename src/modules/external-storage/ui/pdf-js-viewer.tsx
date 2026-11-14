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
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  PDF_ZOOM_PRESETS,
  applyPdfScrollPan,
  centeredPdfScrollLeft,
  clampPdfZoom,
  computePdfPageWidth,
  computePdfZoomPercent,
  createPdfPreviewTimings,
  elapsedMs,
  estimatePageHeight,
  readDevicePixelRatio,
  zoomPresetToPercent,
  type PdfFitMode,
  type PdfPreviewTimings,
} from './pdf-viewer-utils';

pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_PUBLIC_PATH;

/** Mouse drag distance before free-pan captures the pointer (preserves annotate/measure clicks). */
const PDF_PAN_THRESHOLD_PX = 4;

export type PdfPageOverlayRenderProps = {
  readonly pageNumber: number;
  readonly pageWidth: number;
  readonly pageHeight: number;
};

export function PdfJsViewer({
  url,
  reloadKey,
  onRetry,
  onOpenOnDevice,
  onOpenInProvider,
  openInProviderLabel,
  pageOverlay,
}: {
  url: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  onOpenInProvider?: () => void;
  openInProviderLabel?: string | null;
  pageOverlay?: (props: PdfPageOverlayRenderProps) => ReactNode;
}) {
  return (
    <PdfJsViewerInner
      key={`${url}:${reloadKey}`}
      url={url}
      reloadKey={reloadKey}
      onRetry={onRetry}
      onOpenOnDevice={onOpenOnDevice}
      onOpenInProvider={onOpenInProvider}
      openInProviderLabel={openInProviderLabel}
      pageOverlay={pageOverlay}
    />
  );
}

function PdfJsViewerInner({
  url,
  reloadKey,
  onRetry,
  onOpenOnDevice,
  onOpenInProvider,
  openInProviderLabel,
  pageOverlay,
}: {
  url: string;
  reloadKey: number;
  onRetry: () => void;
  onOpenOnDevice?: () => void;
  onOpenInProvider?: () => void;
  openInProviderLabel?: string | null;
  pageOverlay?: (props: PdfPageOverlayRenderProps) => ReactNode;
}) {
  const t = useTranslations('externalStorage.preview');
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const panRef = useRef<{
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
    pointerId: number;
    moved: boolean;
  } | null>(null);
  /** After layout zoom, recenter so left+right overflow are both reachable (LTR scrollport). */
  const centerScrollAfterZoomRef = useRef(false);
  const gestureScaleRef = useRef(1);
  const timingsRef = useRef<PdfPreviewTimings>(createPdfPreviewTimings());
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInputDraft, setPageInputDraft] = useState<string | null>(null);
  const pageInput = pageInputDraft ?? String(currentPage);
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
    centerScrollAfterZoomRef.current = true;
    setZoomFactor((current) => clampPdfZoom(current * scale));
    setGestureScale(1);
    gestureScaleRef.current = 1;
    setFitMode('custom');
  }, []);

  const applyZoomPreset = useCallback((fraction: number) => {
    centerScrollAfterZoomRef.current = true;
    setFitMode('custom');
    setGestureScale(1);
    gestureScaleRef.current = 1;
    setZoomFactor(clampPdfZoom(fraction));
  }, []);

  useLayoutEffect(() => {
    if (!centerScrollAfterZoomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const frame = requestAnimationFrame(() => {
      if (!centerScrollAfterZoomRef.current) return;
      centerScrollAfterZoomRef.current = false;
      // LTR scrollport: center so both horizontal edges are reachable after zoom-in.
      el.scrollLeft = centeredPdfScrollLeft(el.scrollWidth, el.clientWidth);
    });
    return () => cancelAnimationFrame(frame);
  }, [pageWidth, zoomFactor]);

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
    clearLoadTimeout();

    loadTimeoutRef.current = setTimeout(() => {
      failLoad(t('failed'));
    }, PDF_LOAD_TIMEOUT_MS);

    return () => {
      clearLoadTimeout();
    };
  }, [url, reloadKey, clearLoadTimeout, failLoad, t]);

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

    /**
     * Android Chrome often fails to deliver reliable pointermove after setPointerCapture
     * on a scroll container that wraps a PDF canvas. Drive one-finger pan via TouchEvents
     * (non-passive touchmove + preventDefault) — same pattern as pinch.
     */
    const onTouchStart = (event: TouchEvent) => {
      if (isInteractiveSheetMarkTarget(event.target)) return;

      if (event.touches.length >= 2) {
        // Two-finger pinch takes over; cancel any one-finger pan draft.
        panRef.current = null;
        setIsPanning(false);
        if (handToolActive) return;
        const [a, b] = [event.touches[0]!, event.touches[1]!];
        pinchRef.current = {
          distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          zoom: gestureScaleRef.current,
        };
        setIsPinching(true);
        setFitMode('custom');
        return;
      }

      if (event.touches.length !== 1) return;
      const touch = event.touches[0]!;
      panRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        pointerId: touch.identifier,
        moved: true,
      };
      setIsPanning(true);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2 && pinchRef.current && !handToolActive) {
        event.preventDefault();
        const [a, b] = [event.touches[0]!, event.touches[1]!];
        const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const next = Math.min(
          4,
          Math.max(0.25, (pinchRef.current.zoom * distance) / pinchRef.current.distance),
        );
        gestureScaleRef.current = next;
        setGestureScale(next);
        return;
      }

      if (event.touches.length !== 1 || !panRef.current || pinchRef.current) return;
      const touch = event.touches[0]!;
      if (touch.identifier !== panRef.current.pointerId) return;
      event.preventDefault();
      applyPdfScrollPan(
        el,
        { scrollLeft: panRef.current.scrollLeft, scrollTop: panRef.current.scrollTop },
        {
          dx: touch.clientX - panRef.current.x,
          dy: touch.clientY - panRef.current.y,
        },
      );
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (pinchRef.current) {
        // Keep preview alive until both fingers are up, then commit into layout zoom
        // so scrollWidth/scrollHeight match the visual scale and free pan works.
        if (event.touches.length >= 2) return;
        pinchRef.current = null;
        setIsPinching(false);
        commitGestureZoom();
      }

      if (event.touches.length === 0) {
        panRef.current = null;
        setIsPanning(false);
      } else if (
        panRef.current &&
        ![...event.touches].some((touch) => touch.identifier === panRef.current?.pointerId)
      ) {
        panRef.current = null;
        setIsPanning(false);
      }
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
  }, [commitGestureZoom, handToolActive]);

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
      setPageInputDraft(null);
      return;
    }
    const clamped = Math.min(numPages, Math.max(1, parsed));
    setPageInputDraft(null);
    scrollToPage(clamped);
  }, [numPages, pageInput, scrollToPage]);

  const onDocumentLoadSuccess = ({ numPages: total }: { numPages: number }) => {
    clearLoadTimeout();
    setLoadError(null);
    setDocumentLoading(false);
    setNumPages(total);
    timingsRef.current.documentLoadedAt = performance.now();
  };

  const onDocumentLoadError = (error: Error) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[PdfJsViewer] document load failed', error);
    }
    const invalidPdf = /InvalidPDF|Invalid PDF structure/i.test(error.message);
    failLoad(invalidPdf ? t('pdfInvalidStructure') : t('failed'));
  };

  const loadErrorActions = (
    <>
      <Button type="button" variant="secondary" onClick={onRetry}>
        {t('retry')}
      </Button>
      {onOpenOnDevice ? (
        <Button type="button" variant="primary" onClick={onOpenOnDevice}>
          {t('openOnDevice')}
        </Button>
      ) : null}
      {onOpenInProvider && openInProviderLabel ? (
        <Button type="button" variant="secondary" onClick={onOpenInProvider}>
          {openInProviderLabel}
        </Button>
      ) : null}
    </>
  );

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

  /**
   * Mouse pan via pointer capture. Touch/pen pan is owned by the native TouchEvent
   * listeners above — Android Chrome double-fires pointer+touch and would double-scroll.
   */
  const onPanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (isPinching || pinchRef.current) return;
    if (event.button !== 0) return;
    if (isInteractiveSheetMarkTarget(event.target)) return;
    const el = scrollRef.current;
    if (!el) return;
    // Hand tool: grab immediately. Otherwise wait for a small move so annotate/measure clicks still fire.
    const captureNow = handToolActive;
    panRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
      pointerId: event.pointerId,
      moved: captureNow,
    };
    if (captureNow) {
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
    }
  };

  const onPanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = event.clientX - panRef.current.x;
    const dy = event.clientY - panRef.current.y;
    if (!panRef.current.moved) {
      if (Math.hypot(dx, dy) < PDF_PAN_THRESHOLD_PX) return;
      panRef.current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
    }
    event.preventDefault();
    applyPdfScrollPan(
      el,
      { scrollLeft: panRef.current.scrollLeft, scrollTop: panRef.current.scrollTop },
      { dx, dy },
    );
  };

  const endPan = (event?: React.PointerEvent<HTMLDivElement>) => {
    if (event && panRef.current && panRef.current.pointerId !== event.pointerId) return;
    if (event?.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
            onChange={(event) => setPageInputDraft(event.target.value.replace(/\D/g, ''))}
            onBlur={commitPageInput}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitPageInput();
            }}
          />
          <span className="pf-ltr-island text-sm text-[var(--pf-text-secondary)]" dir="ltr">
            {t('pageCountSuffix', { total: numPages })}
          </span>
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
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="secondary" className="md:hidden" aria-label={t('more')}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="z-[80]">
          <DropdownMenuItem onSelect={() => setHandToolActive((active) => !active)}>
            {t('handTool')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="size-4" aria-hidden />
            {t('rotate90')}
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
        <span className="sr-only">{t('rotate90')}</span>
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
    <div data-pf-style="classic" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-[var(--pf-border-default)] px-2 py-2">
        {toolbarControls}
      </div>

      <div
        ref={scrollRef}
        dir="ltr"
        className={cn(
          // LTR scrollport: PDF geometry must not inherit RTL scrollLeft inversion from he-IL shell.
          // touch-none: own one-finger pan (native pan fails under preview shell on some Android browsers).
          // Pinch still uses non-passive touchmove + preventDefault below.
          'relative min-h-0 flex-1 touch-none overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
          handToolActive && 'cursor-grab',
          isPanning && 'cursor-grabbing select-none',
        )}
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {showLoadingOverlay ? <StorageLoadingOverlay label={t('loading')} /> : null}

        {loadError ? (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-4">
            <Alert tone="danger">{loadError}</Alert>
            <div className="flex flex-wrap justify-center gap-2">{loadErrorActions}</div>
          </div>
        ) : (
          <Document
            key={documentKey}
            file={fileSource}
            suspense={false}
            loading={<span className="sr-only">{t('loading')}</span>}
            error={
              <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-4">
                <Alert tone="danger">{t('pdfInvalidStructure')}</Alert>
                <div className="flex flex-wrap justify-center gap-2">{loadErrorActions}</div>
              </div>
            }
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            // Block layout sized to pageWidth (not w-full + items-center): centered wide
            // children under RTL/flex make horizontal scroll one-directional after zoom.
            className="block px-2 py-4"
          >
            <div
              className="mx-auto flex flex-col items-stretch gap-4 origin-top"
              style={{
                width: pageWidth,
                ...(visualScale !== 1
                  ? { transform: `scale(${visualScale})`, transformOrigin: 'top center' }
                  : null),
              }}
            >
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1;
                const pageHeight = estimatePageHeight(pageWidth, pageAspect);
                return (
                  <div
                    key={`${pageNumber}:${Math.round(pageWidth)}:${devicePixelRatio}:${rotation}`}
                    ref={(node) => {
                      if (node) pageRefs.current.set(pageNumber, node);
                      else pageRefs.current.delete(pageNumber);
                    }}
                    data-page={pageNumber}
                    className={pageOverlay ? 'relative' : undefined}
                    style={{ width: pageWidth, ...(pageOverlay ? { minHeight: pageHeight } : null) }}
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
                    {pageOverlay ? (
                      <div
                        className="absolute inset-0"
                        style={{ width: pageWidth, height: pageHeight }}
                      >
                        {pageOverlay({ pageNumber, pageWidth, pageHeight })}
                      </div>
                    ) : null}
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

/** Sheet-mark annotate/measure overlay uses Tailwind `cursor-crosshair` while interactive. */
function isInteractiveSheetMarkTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('button, a, input, textarea, select, [role="button"]')) return true;
  return Boolean(target.closest('.cursor-crosshair'));
}

function nearestZoomLabel(percent: number): string {
  return `${percent}%`;
}
