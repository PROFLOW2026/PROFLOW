const STORAGE_KEY = 'exlfy.takeoff.symbolFocusZoom';

/** 0 = wide context, 100 = very close. Default matches the previous CAD pad ~0.37. */
export const SYMBOL_FOCUS_ZOOM_DEFAULT = 72;
export const SYMBOL_FOCUS_ZOOM_MIN = 0;
export const SYMBOL_FOCUS_ZOOM_MAX = 100;

const PAD_WIDE = 1.2;
const PAD_CLOSE = 0.08;
const INSERT_WIDE = 72;
const INSERT_CLOSE = 12;

function clampLevel(value: number): number {
  if (!Number.isFinite(value)) return SYMBOL_FOCUS_ZOOM_DEFAULT;
  return Math.min(SYMBOL_FOCUS_ZOOM_MAX, Math.max(SYMBOL_FOCUS_ZOOM_MIN, Math.round(value)));
}

function mix(wide: number, close: number, level: number): number {
  const t = clampLevel(level) / SYMBOL_FOCUS_ZOOM_MAX;
  return wide * (1 - t) + close * t;
}

export function padFactorForSymbolFocus(level: number): number {
  return mix(PAD_WIDE, PAD_CLOSE, level);
}

export function insertHalfForSymbolFocus(level: number): number {
  return mix(INSERT_WIDE, INSERT_CLOSE, level);
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
