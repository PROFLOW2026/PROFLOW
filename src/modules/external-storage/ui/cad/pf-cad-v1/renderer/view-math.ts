import type { CadExtent } from './segment-format';

/** World (RTC) coordinates: `pan` is the world point at the viewport center; `zoom` is pixels per world unit. */
export type CadView = {
  panX: number;
  panY: number;
  zoom: number;
};

export type ViewportSize = {
  width: number;
  height: number;
};

const MIN_ZOOM = 1e-9;

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom < MIN_ZOOM) {
    return MIN_ZOOM;
  }
  return zoom;
}

/** Map world RTC point to pixel coordinates (origin top-left, y down). */
export function worldToScreen(
  x: number,
  y: number,
  view: CadView,
  viewport: ViewportSize,
): [number, number] {
  const z = clampZoom(view.zoom);
  const sx = (x - view.panX) * z + viewport.width * 0.5;
  const sy = -(y - view.panY) * z + viewport.height * 0.5;
  return [sx, sy];
}

/**
 * Compute pan/zoom so `extent` (x0,y0,x1,y1 in RTC) fits inside the viewport with optional padding (px).
 */
/** Pixel coords (origin top-left) → world RTC. */
export function screenToWorld(
  sx: number,
  sy: number,
  view: CadView,
  viewport: ViewportSize,
): [number, number] {
  const z = clampZoom(view.zoom);
  const wx = (sx - viewport.width * 0.5) / z + view.panX;
  const wy = -(sy - viewport.height * 0.5) / z + view.panY;
  return [wx, wy];
}

/** Zoom about a screen point while keeping the world point under the cursor fixed. */
export function zoomAtScreenPoint(
  view: CadView,
  viewport: ViewportSize,
  sx: number,
  sy: number,
  factor: number,
): CadView {
  const z0 = clampZoom(view.zoom);
  const z1 = clampZoom(z0 * factor);
  if (z1 === z0) {
    return view;
  }
  const [wx, wy] = screenToWorld(sx, sy, view, viewport);
  return {
    panX: wx - (sx - viewport.width * 0.5) / z1,
    panY: wy + (sy - viewport.height * 0.5) / z1,
    zoom: z1,
  };
}

export function computeFitView(
  extent: CadExtent,
  viewport: ViewportSize,
  paddingPx = 16,
): CadView {
  const [x0, y0, x1, y1] = extent;
  const wWorld = Math.max(x1 - x0, 1e-12);
  const hWorld = Math.max(y1 - y0, 1e-12);
  const innerW = Math.max(viewport.width - paddingPx * 2, 1);
  const innerH = Math.max(viewport.height - paddingPx * 2, 1);
  const zoom = clampZoom(Math.min(innerW / wWorld, innerH / hWorld));
  return {
    panX: (x0 + x1) * 0.5,
    panY: (y0 + y1) * 0.5,
    zoom,
  };
}
