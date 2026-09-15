'use client';

import { Page } from 'react-pdf';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { PDF_LAZY_ROOT_MARGIN, estimatePageHeight } from './pdf-viewer-utils';

export function PdfLazyPage({
  pageNumber,
  pageWidth,
  pageAspect,
  devicePixelRatio,
  rotation = 0,
  eager,
  scrollRoot,
  loadingLabel,
  onFirstPageMetrics,
  onPageAspect,
}: {
  pageNumber: number;
  pageWidth: number;
  pageAspect: number;
  devicePixelRatio: number;
  rotation?: number;
  eager: boolean;
  scrollRoot: HTMLElement | null;
  loadingLabel: string;
  onFirstPageMetrics?: () => void;
  onPageAspect?: (aspect: number) => void;
}) {
  const slotRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(eager);

  useEffect(() => {
    if (eager || shouldRender) return;
    const node = slotRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { root: scrollRoot, rootMargin: PDF_LAZY_ROOT_MARGIN, threshold: 0.01 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager, scrollRoot, shouldRender]);

  const placeholderHeight = estimatePageHeight(pageWidth, pageAspect);

  return (
    <div
      ref={slotRef}
      data-page={pageNumber}
      className="shadow-sm"
      style={{ minHeight: placeholderHeight }}
    >
      {shouldRender ? (
        <Page
          pageNumber={pageNumber}
          width={pageWidth}
          rotate={rotation}
          devicePixelRatio={devicePixelRatio}
          suspense={false}
          onLoadSuccess={
            pageNumber === 1
              ? (page) => {
                  if (page.height > 0) onPageAspect?.(page.width / page.height);
                }
              : undefined
          }
          onRenderSuccess={pageNumber === 1 ? onFirstPageMetrics : undefined}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={
            <div
              className="flex w-full items-center justify-center"
              style={{ height: placeholderHeight }}
            >
              <Spinner className="size-5" label={loadingLabel} />
            </div>
          }
        />
      ) : (
        <div aria-hidden style={{ height: placeholderHeight }} />
      )}
    </div>
  );
}
