/**
 * Pure zoom / pan maths of the watching phone. The view is `translate(x, y) scale(s)` around the centre of the
 * stage; only the viewer's own display changes - the broadcast picture is never touched.
 */

export interface ViewTransform {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

export const IDENTITY_VIEW: ViewTransform = { scale: 1, x: 0, y: 0 };
export const MIN_VIEW_SCALE = 1;
export const MAX_VIEW_SCALE = 6;
export const DOUBLE_TAP_SCALE = 2.5;

/** Keeps the scale in range and the picture covering the whole stage (no empty edges, no drifting away). */
export function clampView(view: ViewTransform, stageW: number, stageH: number): ViewTransform {
  const scale = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, view.scale));
  const limitX = ((scale - 1) * stageW) / 2;
  const limitY = ((scale - 1) * stageH) / 2;
  return {
    scale,
    x: Math.min(limitX, Math.max(-limitX, view.x)),
    y: Math.min(limitY, Math.max(-limitY, view.y)),
  };
}

export function panView(view: ViewTransform, dx: number, dy: number, stageW: number, stageH: number): ViewTransform {
  if (view.scale <= MIN_VIEW_SCALE) return view;
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, stageW, stageH);
}

/**
 * Zooms by `factor` keeping the picture point under `pivot` (relative to the stage centre) in place, and then
 * moves by `shift` (two fingers sliding together).
 */
export function zoomView(
  view: ViewTransform,
  factor: number,
  pivot: { readonly x: number; readonly y: number },
  shift: { readonly x: number; readonly y: number },
  stageW: number,
  stageH: number,
): ViewTransform {
  const scale = Math.min(MAX_VIEW_SCALE, Math.max(MIN_VIEW_SCALE, view.scale * factor));
  const applied = scale / view.scale;
  return clampView(
    {
      scale,
      x: pivot.x + shift.x - applied * (pivot.x - view.x),
      y: pivot.y + shift.y - applied * (pivot.y - view.y),
    },
    stageW,
    stageH,
  );
}

/* -------------------------------------------------------------------------- */
/* Mapping touches to the PICTURE (remote marking)                              */
/* -------------------------------------------------------------------------- */

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Where an `object-contain` picture of `aspect` (width / height) sits inside a box (before any zoom). */
export function containedRect(boxW: number, boxH: number, aspect: number): Rect {
  if (!(boxW > 0) || !(boxH > 0) || !(aspect > 0) || !Number.isFinite(aspect)) {
    return { left: 0, top: 0, width: Math.max(0, boxW), height: Math.max(0, boxH) };
  }
  const width = Math.min(boxW, boxH * aspect);
  const height = width / aspect;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * A touch (relative to the box's top-left corner) -> a point of the picture, 0..1 of its width and height,
 * independent of the viewer's zoom, pan, screen size or letterboxing. The black margins and anything outside the
 * picture give `null` (nothing can be marked there). `clamp` keeps a point that is dragged past the edge on the edge.
 */
export function clientToImage(
  touch: Point,
  box: { readonly w: number; readonly h: number },
  view: ViewTransform,
  aspect: number,
  options: { readonly clamp?: boolean } = {},
): Point | null {
  const rect = containedRect(box.w, box.h, aspect);
  if (rect.width <= 0 || rect.height <= 0 || view.scale <= 0) return null;
  const cx = box.w / 2;
  const cy = box.h / 2;
  // Undo `translate(x, y) scale(s)` around the box centre.
  const ux = cx + (touch.x - cx - view.x) / view.scale;
  const uy = cy + (touch.y - cy - view.y) / view.scale;
  const nx = (ux - rect.left) / rect.width;
  const ny = (uy - rect.top) / rect.height;
  if (options.clamp) return { x: clamp01(nx), y: clamp01(ny) };
  const eps = 1e-9;
  if (nx < -eps || nx > 1 + eps || ny < -eps || ny > 1 + eps) return null;
  return { x: clamp01(nx), y: clamp01(ny) };
}

/** The opposite direction: a point of the picture -> where it is on the box right now (zoom and pan included). */
export function imageToBox(
  point: Point,
  box: { readonly w: number; readonly h: number },
  view: ViewTransform,
  aspect: number,
): Point {
  const rect = containedRect(box.w, box.h, aspect);
  const cx = box.w / 2;
  const cy = box.h / 2;
  const ux = rect.left + point.x * rect.width;
  const uy = rect.top + point.y * rect.height;
  return { x: cx + view.x + view.scale * (ux - cx), y: cy + view.y + view.scale * (uy - cy) };
}

/** The index of the point nearest to the touch within `radius` screen pixels, or -1. */
export function nearestPoint(
  points: readonly Point[],
  touch: Point,
  box: { readonly w: number; readonly h: number },
  view: ViewTransform,
  aspect: number,
  radius: number,
): number {
  let best = -1;
  let bestDistance = radius;
  points.forEach((point, index) => {
    const at = imageToBox(point, box, view, aspect);
    const distance = Math.hypot(at.x - touch.x, at.y - touch.y);
    if (distance <= bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

/**
 * Moves a picture point by a finger movement (screen pixels), scaled by `gain` (< 1 = finer than the finger).
 * The same screen movement moves the point less when the viewer is zoomed in, so zoom makes marking more precise.
 */
export function dragPoint(
  start: Point,
  delta: Point,
  box: { readonly w: number; readonly h: number },
  view: ViewTransform,
  aspect: number,
  gain: number,
): Point {
  const rect = containedRect(box.w, box.h, aspect);
  if (rect.width <= 0 || rect.height <= 0 || view.scale <= 0) return start;
  return {
    x: clamp01(start.x + (delta.x * gain) / (view.scale * rect.width)),
    y: clamp01(start.y + (delta.y * gain) / (view.scale * rect.height)),
  };
}
