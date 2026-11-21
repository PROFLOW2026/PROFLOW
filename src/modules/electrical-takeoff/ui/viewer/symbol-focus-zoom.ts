const STORAGE_KEY = 'exlfy.takeoff.symbolFocusZoom';

/** 0 = smaller symbol, 100 = larger symbol. Mid default is clearly zoomed on the mark. */
export const SYMBOL_FOCUS_ZOOM_DEFAULT = 55;
export const SYMBOL_FOCUS_ZOOM_MIN = 0;
export const SYMBOL_FOCUS_ZOOM_MAX = 100;
export const SYMBOL_FOCUS_ZOOM_STEP = 10;

const COVERAGE_SMALL = 0.22;
const COVERAGE_LARGE = 0.82;
const BODY_MIN = 8;
const BODY_MAX = 48;
const INSERT_BODY = 24;

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return SYMBOL_FOCUS_ZOOM_DEFAULT;
  return Math.min(SYMBOL_FOCUS_ZOOM_MAX, Math.max(SYMBOL_FOCUS_ZOOM_MIN, Math.round(value)));
}

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom < 1e-9) return 1e-9;
  return zoom;
}

/** Fraction of the short viewport side occupied by the selected symbol. */
export function symbolCoverage(level: number): number {
  const t = clampLevel(level) / SYMBOL_FOCUS_ZOOM_MAX;
  return COVERAGE_SMALL + t * (COVERAGE_LARGE - COVERAGE_SMALL);
}

/** World size used for zoom. Caps a bad/huge box so the slider cannot fit the sheet. */
export function symbolBodyForSize(
  box: { located?: boolean; minX: number; minY: number; maxX: number; maxY: number },
  fallback = INSERT_BODY,
): number {
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  if (box.located && span > 0 && span <= 96) {
    return Math.min(Math.max(span, BODY_MIN), BODY_MAX);
  }
  return fallback;
}

export function cadViewForSymbolSize(input: {
  x: number;
  y: number;
  body: number;
  viewport: { width: number; height: number };
  level: number;
}): { panX: number; panY: number; zoom: number } {
  const coverage = symbolCoverage(input.level);
  const short = Math.max(Math.min(input.viewport.width, input.viewport.height), 1);
  const body = Math.min(Math.max(input.body, BODY_MIN), BODY_MAX);
  return {
    panX: input.x,
    panY: input.y,
    zoom: clampZoom((short * coverage) / body),
  };
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
