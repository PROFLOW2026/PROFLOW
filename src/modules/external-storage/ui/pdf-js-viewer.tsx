'use client';

import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, Scan, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/shared/ui/cn';
import './pdf-worker';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;

type FitMode = 'width' | 'page' | 'custom';

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
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(640);
  const [containerHeight, setContainerHeight] = useState(480);
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [zoomFactor, setZoomFactor] = useState(1);
  const [pageAspect, setPageAspect] = useState(1.414);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);

  const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));

  const pageWidth = useMemo(() => {
    if (fitMode === 'page') {
      const fitByHeight = containerHeight * pageAspect;
      const fitByWidth = containerWidth;
      return Math.min(fitByWidth, fitByHeight) * zoomFactor;
    }
    return containerWidth * zoomFactor;
  }, [containerHeight, containerWidth, fitMode, pageAspect, zoomFactor]);

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
    setLoadError(false);
    setLoading(true);
    setNumPages(0);
    setCurrentPage(1);
    setFitMode('width');
    setZoomFactor(1);
  }, [url, reloadKey]);

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

  const scrollToPage = useCallback((page: number) => {
    const node = pageRefs.current.get(page);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(page);
  }, []);

  const onDocumentLoadSuccess = ({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setLoading(false);
    setLoadError(false);
  };

  const onDocumentLoadError = () => {
    setLoading(false);
    setLoadError(true);
  };

  const onPageLoadSuccess = (page: { width: number; height: number }) => {
    if (page.height > 0) setPageAspect(page.width / page.height);
  };

  const onTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length === 2) {
      const [a, b] = [event.touches[0]!, event.touches[1]!];
      pinchRef.current = {
        distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: zoomFactor,
      };
      setFitMode('custom');
    }
  };

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const [a, b] = [event.touches[0]!, event.touches[1]!];
    const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    setZoomFactor(clampZoom((pinchRef.current.zoom * distance) / pinchRef.current.distance));
  };

  const onTouchEnd = () => {
    pinchRef.current = null;
  };

  const fileSource = useMemo(
    () => ({ url, withCredentials: true as const }),
    [url],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-[var(--pf-border-default)] px-2 py-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            setFitMode('custom');
            setZoomFactor((z) => clampZoom(z - 0.25));
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
            setZoomFactor((z) => clampZoom(z + 0.25));
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
          'relative min-h-0 flex-1 touch-manipulation overflow-auto overscroll-contain bg-[var(--pf-surface-muted)]',
        )}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {loading ? (
          <div className="flex h-full min-h-[40vh] items-center justify-center">
            <Spinner className="size-6" label={t('loading')} />
          </div>
        ) : null}

        {loadError ? (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 p-4">
            <Alert tone="danger">{t('failed')}</Alert>
            <Button type="button" variant="secondary" onClick={onRetry}>
              {t('retry')}
            </Button>
          </div>
        ) : null}

        {!loadError ? (
          <Document
            key={`${url}:${reloadKey}`}
            file={fileSource}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
            className="flex flex-col items-center gap-4 px-2 py-4"
          >
            {Array.from({ length: numPages }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <div
                  key={pageNumber}
                  ref={(node) => {
                    if (node) pageRefs.current.set(pageNumber, node);
                    else pageRefs.current.delete(pageNumber);
                  }}
                  data-page={pageNumber}
                  className="shadow-sm"
                >
                  <Page
                    pageNumber={pageNumber}
                    width={pageWidth}
                    onLoadSuccess={pageNumber === 1 ? onPageLoadSuccess : undefined}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    loading={
                      <div className="flex h-48 w-full items-center justify-center">
                        <Spinner className="size-5" label={t('loading')} />
                      </div>
                    }
                  />
                </div>
              );
            })}
          </Document>
        ) : null}
      </div>
    </div>
  );
}
