/** Pure viewport math for the plan viewer (unit-tested). Coordinates: preview pixel space, origin top-left. */

export interface ViewportState {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const VIEWER_MIN_SCALE = 0.05;
export const VIEWER_MAX_SCALE = 12;

export function clampScale(scale: number): number {
  return Math.min(VIEWER_MAX_SCALE, Math.max(VIEWER_MIN_SCALE, scale));
}

/** Plain wheel scrolls the page. Zoom only with Ctrl or Cmd. */
export function wheelZoomsPlan(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
  return event.ctrlKey || event.metaKey;
}

/** Map pointer position on the viewer element to plan coordinates. */
export function screenToPlan(
  clientX: number,
  clientY: number,
  viewerRect: DOMRect,
  viewport: ViewportState,
): { x: number; y: number } {
  const localX = clientX - viewerRect.left;
  const localY = clientY - viewerRect.top;
  return {
    x: (localX - viewport.offsetX) / viewport.scale,
    y: (localY - viewport.offsetY) / viewport.scale,
  };
}

export function planToScreen(
  planX: number,
  planY: number,
  viewport: ViewportState,
): { x: number; y: number } {
  return {
    x: planX * viewport.scale + viewport.offsetX,
    y: planY * viewport.scale + viewport.offsetY,
  };
}

export function zoomAtPoint(
  viewport: ViewportState,
  factor: number,
  anchorX: number,
  anchorY: number,
): ViewportState {
  const nextScale = clampScale(viewport.scale * factor);
  const ratio = nextScale / viewport.scale;
  return {
    scale: nextScale,
    offsetX: anchorX - (anchorX - viewport.offsetX) * ratio,
    offsetY: anchorY - (anchorY - viewport.offsetY) * ratio,
  };
}

export function panBy(viewport: ViewportState, dx: number, dy: number): ViewportState {
  return {
    ...viewport,
    offsetX: viewport.offsetX + dx,
    offsetY: viewport.offsetY + dy,
  };
}

/** Fit `content` inside `view` with padding (pixels). */
export function fitToRect(view: Size, content: Size, padding = 24): ViewportState {
  if (content.width <= 0 || content.height <= 0 || view.width <= 0 || view.height <= 0) {
    return { scale: 1, offsetX: padding, offsetY: padding };
  }
  const innerW = Math.max(1, view.width - padding * 2);
  const innerH = Math.max(1, view.height - padding * 2);
  const scale = clampScale(Math.min(innerW / content.width, innerH / content.height));
  const offsetX = (view.width - content.width * scale) / 2;
  const offsetY = (view.height - content.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x - r.width / 2);
    minY = Math.min(minY, r.y - r.height / 2);
    maxX = Math.max(maxX, r.x + r.width / 2);
    maxY = Math.max(maxY, r.y + r.height / 2);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, width: maxX - minX, height: maxY - minY };
}

function clampedSymbolWindow(
  mark: { x: number; y: number; w: number; h: number },
  factor: number,
  minSpan: number,
  maxSpan: number,
): Rect {
  const body = Math.max(mark.w, mark.h, 8);
  const span = Math.min(Math.max(body * factor, minSpan), maxSpan);
  return { x: mark.x, y: mark.y, width: span, height: span };
}

/** Tight window around one mark. Never the union of a group or the whole sheet. */
export function occurrenceFocusRect(mark: { x: number; y: number; w: number; h: number }): Rect {
  return clampedSymbolWindow(mark, 2.6, 36, 180);
}

/** Even tighter crop for a list thumbnail of the real symbol. */
export function symbolThumbnailRect(mark: { x: number; y: number; w: number; h: number }): Rect {
  return clampedSymbolWindow(mark, 1.8, 24, 96);
}

/** Slightly wider window so the compare view can show nearby context. */
export function symbolContextRect(mark: { x: number; y: number; w: number; h: number }): Rect {
  return clampedSymbolWindow(mark, 4.2, 48, 260);
}

export function fitSelection(
  view: Size,
  selection: Rect,
  padding = 48,
): ViewportState {
  const padded = {
    width: Math.max(selection.width, 8),
    height: Math.max(selection.height, 8),
  };
  const base = fitToRect(view, padded, padding);
  const cx = selection.x;
  const cy = selection.y;
  return {
    scale: base.scale,
    offsetX: view.width / 2 - cx * base.scale,
    offsetY: view.height / 2 - cy * base.scale,
  };
}

/** Which detection ids fall inside an axis-aligned rect in plan space (centre-in-rect). */
/** Whether a plan-space point is inside the visible viewport (with margin). */
export function planPointInViewport(
  x: number,
  y: number,
  view: Size,
  viewport: ViewportState,
  marginPx = 40,
): boolean {
  const left = (-viewport.offsetX - marginPx) / viewport.scale;
  const top = (-viewport.offsetY - marginPx) / viewport.scale;
  const right = (view.width - viewport.offsetX + marginPx) / viewport.scale;
  const bottom = (view.height - viewport.offsetY + marginPx) / viewport.scale;
  return x >= left && x <= right && y >= top && y <= bottom;
}

export function idsInPlanRect(
  items: readonly { id: string; x: number; y: number }[],
  rect: Rect,
): string[] {
  const x0 = rect.x - rect.width / 2;
  const x1 = rect.x + rect.width / 2;
  const y0 = rect.y - rect.height / 2;
  const y1 = rect.y + rect.height / 2;
  return items.filter((d) => d.x >= x0 && d.x <= x1 && d.y >= y0 && d.y <= y1).map((d) => d.id);
}