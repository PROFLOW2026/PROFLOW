export const MIN_PDF_ZOOM = 0.25;
export const MAX_PDF_ZOOM = 10;
export const PDF_LOAD_TIMEOUT_MS = 45_000;
export const PDF_PINCH_COMMIT_MS = 120;
export const PDF_LAZY_ROOT_MARGIN = '320px 0px';

export type PdfFitMode = 'width' | 'page' | 'custom';

export function clampPdfZoom(value: number): number {
  return Math.min(MAX_PDF_ZOOM, Math.max(MIN_PDF_ZOOM, value));
}

export function computePdfPageWidth(input: {
  fitMode: PdfFitMode;
  containerWidth: number;
  containerHeight: number;
  pageAspect: number;
  zoomFactor: number;
}): number {
  const { fitMode, containerWidth, containerHeight, pageAspect, zoomFactor } = input;
  if (fitMode === 'page') {
    const fitByHeight = containerHeight * pageAspect;
    return Math.min(containerWidth, fitByHeight) * zoomFactor;
  }
  return containerWidth * zoomFactor;
}

export function readDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(window.devicePixelRatio || 1, 3);
}

export function estimatePageHeight(pageWidth: number, pageAspect: number): number {
  if (pageAspect <= 0) return pageWidth * 1.414;
  return pageWidth / pageAspect;
}

export type PdfPreviewTimings = {
  openedAt: number;
  documentLoadedAt?: number;
  firstPageRenderedAt?: number;
};

export function createPdfPreviewTimings(): PdfPreviewTimings {
  return { openedAt: typeof performance !== 'undefined' ? performance.now() : 0 };
}

export function elapsedMs(from: number, to = performance.now()): number {
  return Math.round(to - from);
}
