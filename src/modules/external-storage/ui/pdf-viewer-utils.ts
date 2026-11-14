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

/**
 * Horizontal scroll range in an LTR scrollport (PDF geometry is always LTR).
 * Returns max scrollLeft (>= 0). Used to clamp pan so both edges stay reachable.
 */
export function pdfMaxScrollLeft(scrollWidth: number, clientWidth: number): number {
  return Math.max(0, scrollWidth - clientWidth);
}

export function clampPdfScrollLeft(
  next: number,
  scrollWidth: number,
  clientWidth: number,
): number {
  const max = pdfMaxScrollLeft(scrollWidth, clientWidth);
  if (!Number.isFinite(next)) return 0;
  return Math.min(max, Math.max(0, next));
}

export function clampPdfScrollTop(
  next: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  if (!Number.isFinite(next)) return 0;
  return Math.min(max, Math.max(0, next));
}

/** Center the viewport so left and right overflow are both reachable after zoom. */
export function centeredPdfScrollLeft(scrollWidth: number, clientWidth: number): number {
  return pdfMaxScrollLeft(scrollWidth, clientWidth) / 2;
}

/**
 * Apply one-finger / mouse pan deltas onto an LTR overflow scroller.
 * Avoids RTL inverted scrollLeft and keeps both horizontal directions in range.
 */
export function applyPdfScrollPan(
  el: {
    scrollLeft: number;
    scrollTop: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  },
  origin: { readonly scrollLeft: number; readonly scrollTop: number },
  delta: { readonly dx: number; readonly dy: number },
): void {
  el.scrollLeft = clampPdfScrollLeft(
    origin.scrollLeft - delta.dx,
    el.scrollWidth,
    el.clientWidth,
  );
  el.scrollTop = clampPdfScrollTop(
    origin.scrollTop - delta.dy,
    el.scrollHeight,
    el.clientHeight,
  );
}

export function touchPairMidpoint(
  a: { readonly clientX: number; readonly clientY: number },
  b: { readonly clientX: number; readonly clientY: number },
): { x: number; y: number } {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

/** Midpoint in scrollport client coordinates (LTR viewport). */
export function viewportFocalFromClientMidpoint(
  midpoint: { readonly x: number; readonly y: number },
  viewport: { readonly left: number; readonly top: number },
): { x: number; y: number } {
  return { x: midpoint.x - viewport.left, y: midpoint.y - viewport.top };
}

/**
 * Keep the content point under the focal on-screen when scale changes, and follow a
 * moving focal (pinch midpoint drag) in the same step.
 *
 * scaleRatio = newScale / oldScale. focal values are relative to the scrollport client box.
 */
export function scrollAfterScaleAtFocal(input: {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly focalX: number;
  readonly focalY: number;
  readonly prevFocalX?: number;
  readonly prevFocalY?: number;
  readonly scaleRatio: number;
}): { scrollLeft: number; scrollTop: number } {
  const ratio =
    Number.isFinite(input.scaleRatio) && input.scaleRatio > 0 ? input.scaleRatio : 1;
  const prevX = input.prevFocalX ?? input.focalX;
  const prevY = input.prevFocalY ?? input.focalY;
  return {
    scrollLeft: (input.scrollLeft + prevX) * ratio - input.focalX,
    scrollTop: (input.scrollTop + prevY) * ratio - input.focalY,
  };
}

export function clampPdfScrollPosition(
  next: { readonly scrollLeft: number; readonly scrollTop: number },
  el: {
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly clientWidth: number;
    readonly clientHeight: number;
  },
): { scrollLeft: number; scrollTop: number } {
  return {
    scrollLeft: clampPdfScrollLeft(next.scrollLeft, el.scrollWidth, el.clientWidth),
    scrollTop: clampPdfScrollTop(next.scrollTop, el.scrollHeight, el.clientHeight),
  };
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
