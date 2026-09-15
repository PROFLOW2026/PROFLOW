'use client';

import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Scan, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/shared/ui/cn';
import { PdfLazyPage } from './pdf-lazy-page';
import { PDFJS_WORKER_PUBLIC_PATH } from './pdf-viewer-config';
import {
  PDF_LOAD_TIMEOUT_MS,
  PDF_PINCH_COMMIT_MS,
  clampPdfZoom,
  computePdfPageWidth,
  createPdfPreviewTimings,
  elapsedMs,
  readDevicePixelRatio,
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
  const gestureScaleRef = useRef(1);
  const timingsRef = useRef<PdfPreviewTimings>(createPdfPreviewTimings());
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(640);
  const [containerHeight, setContainerHeight] = useState(480);
  const [fitMode, setFitMode] = useState<PdfFitMode>('width');
  const [zoomFactor, setZoomFactor] = useState(1);
  const [gestureScale, setGestureScale] = useState(1);
  const [isPinching, setIsPinching] = useState(false);
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

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const failLoad = useCallback(
    (message?: string) => {
      clearLoadTimeout();
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
    setNumPages(0);
    setCurrentPage(1);
    setFitMode('width');
    setZoomFactor(1);
    setGestureScale(1);
    setIsPinching(false);
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
  }, [numPages, pageWidth]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (event: TouchEvent) => {
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
  }, [commitGestureZoom, gestureScale]);

  const scrollToPage = useCallback((page: number) => {
    const node = pageRefs.current.get(page);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: total }: { numPages: number }) => {
    clearLoadTimeout();
    setLoadError(null);
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

  const fileSource = useMemo(
    () => ({ url, withCredentials: true as const }),
    [url],
  );

  const documentKey = `${url}:${reloadKey}`;
  const visualScale = gestureScale;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-[var(--pf-border-default)] px-2 py-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setFitMode('custom');
            setGestureScale(1);
            setZoomFactor((z) => clampPdfZoom(z - 0.25));
          }}
        >
          <Minus className="size-4" aria-hidden />
          <span className="sr-only">{t('zoomOut')}</span>
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
          <RotateCcw className="size-4" aria-hidden />
          <span className="sr-only">{t('reset')}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
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
          variant="secondary"
          onClick={() => {
            setFitMode('width');
            setGestureScale(1);
            setZoomFactor(1);
          }}
        >
          <Scan className="size-4" aria-hidden />
          {t('fitWidth')}
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
          {t('fitPage')}
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
            <span className="min-w-[4.5rem] text-center text-sm text-[var(--pf-text-secondary)]">
              {currentPage} / {numPages}
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
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
          isPinching ? 'touch-none' : 'touch-pan-x touch-pan-y',
        )}
      >
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
            loading={
              <div className="flex h-full min-h-[40vh] items-center justify-center">
                <Spinner className="size-6" label={t('loading')} />
              </div>
            }
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
                    key={`${pageNumber}:${Math.round(pageWidth)}:${devicePixelRatio}`}
                    ref={(node) => {
                      if (node) pageRefs.current.set(pageNumber, node);
                      else pageRefs.current.delete(pageNumber);
                    }}
                  >
                    <PdfLazyPage
                      pageNumber={pageNumber}
                      pageWidth={pageWidth}
                      pageAspect={pageAspect}
                      devicePixelRatio={devicePixelRatio}
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
