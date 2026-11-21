const STORAGE_KEY = 'exlfy.takeoff.symbolFocusZoom';

/** 0 = smaller highlight marker, 100 = larger highlight marker. */
export const SYMBOL_FOCUS_ZOOM_DEFAULT = 55;
export const SYMBOL_FOCUS_ZOOM_MIN = 0;
export const SYMBOL_FOCUS_ZOOM_MAX = 100;
export const SYMBOL_FOCUS_ZOOM_STEP = 10;

/** CSS-pixel radius of the orange ring/cross at slider 0 and 100. */
export const HIGHLIGHT_MARKER_RADIUS_MIN_PX = 10;
export const HIGHLIGHT_MARKER_RADIUS_MAX_PX = 56;

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return SYMBOL_FOCUS_ZOOM_DEFAULT;
  return Math.min(SYMBOL_FOCUS_ZOOM_MAX, Math.max(SYMBOL_FOCUS_ZOOM_MIN, Math.round(value)));
}

/** Screen-pixel radius of the selection highlight. Does not change CAD zoom or geometry. */
export function highlightMarkerRadiusPx(level: number, devicePixelRatio = 1): number {
  const t = clampLevel(level) / SYMBOL_FOCUS_ZOOM_MAX;
  const css =
    HIGHLIGHT_MARKER_RADIUS_MIN_PX +
    t * (HIGHLIGHT_MARKER_RADIUS_MAX_PX - HIGHLIGHT_MARKER_RADIUS_MIN_PX);
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return css * dpr;
}

/**
 * Ring around the accessory on screen. Slider size is a pixel floor/extra,
 * never a camera zoom. A near-zero box does not shrink the ring to a pin.
 */
export function highlightRingRadiusPx(
  accessoryHalfPx: number | null,
  sliderPx: number,
  gapPx: number,
): number {
  const slider = Number.isFinite(sliderPx) && sliderPx > 0 ? sliderPx : 0;
  const gap = Number.isFinite(gapPx) && gapPx > 0 ? gapPx : 0;
  if (accessoryHalfPx != null && Number.isFinite(accessoryHalfPx) && accessoryHalfPx > 1) {
    return Math.max(accessoryHalfPx + gap, slider);
  }
  return Math.max(slider, gap);
}

const listeners = new Set<() => void>();
let memoryLevel = SYMBOL_FOCUS_ZOOM_DEFAULT;

function notifySymbolFocusZoom() {
  for (const listener of listeners) listener();
}

export function subscribeSymbolFocusZoom(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readStoredSymbolFocusZoom(): number {
  if (typeof window === 'undefined') return memoryLevel;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === '') return memoryLevel;
    memoryLevel = clampLevel(Number(raw));
    return memoryLevel;
  } catch {
    return memoryLevel;
  }
}

export function writeStoredSymbolFocusZoom(level: number): number {
  const next = clampLevel(level);
  memoryLevel = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Private mode / quota — keep the in-memory value.
    }
  }
  notifySymbolFocusZoom();
  return next;
}

export function stepStoredSymbolFocusZoom(delta: number): number {
  return writeStoredSymbolFocusZoom(readStoredSymbolFocusZoom() + delta);
}
