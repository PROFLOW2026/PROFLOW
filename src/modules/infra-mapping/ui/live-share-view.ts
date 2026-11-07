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
