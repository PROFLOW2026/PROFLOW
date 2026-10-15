export const MIN_PDF_ZOOM = 0.25;
export const MAX_PDF_ZOOM = 10;

/** Preset zoom levels shown in the viewer selector (fraction of fit-width baseline). */
export const PDF_ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

export function zoomPresetToPercent(fraction: number): number {
  return Math.round(fraction * 100);
}

export function computePdfZoomPercent(input: {
  containerWidth: number;
  pageWidth: number;
}): number {
  if (input.containerWidth <= 0) return 100;
  return Math.round((input.pageWidth / input.containerWidth) * 100);
}

export function nearestZoomPresetLabel(percent: number): string {
  return `${percent}%`;
}
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

/** PDF files begin with the ASCII signature `%PDF-` (may follow optional BOM/whitespace). */
export function isPdfFileBytes(data: Uint8Array): boolean {
  let i = 0;
  if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
    i = 3;
  }
  while (
    i < data.length &&
    (data[i] === 0x09 || data[i] === 0x0a || data[i] === 0x0d || data[i] === 0x20)
  ) {
    i += 1;
  }
  if (data.length < i + 5) return false;
  return (
    data[i] === 0x25 &&
    data[i + 1] === 0x50 &&
    data[i + 2] === 0x44 &&
    data[i + 3] === 0x46 &&
    data[i + 4] === 0x2d
  );
}
