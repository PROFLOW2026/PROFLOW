export type ArchitectureMode = 'original' | 'gray' | 'mono' | 'hidden';

export type ArchitectureStyle = {
  mode: ArchitectureMode;
  /** 1 keeps the gray solid. 0 fades it, still above the contrast floor. */
  strength: number;
};

export const ORIGINAL_ARCHITECTURE: ArchitectureStyle = { mode: 'original', strength: 1 };

export type ArchitectureApply =
  | { ok: true; mode: ArchitectureMode; indexes: number[] }
  | { ok: false; reason: 'missing' | 'unsupported' };

/** A mode is applied only when this viewer can draw it and the background layers are known. */
export function resolveArchitectureApply(
  mode: ArchitectureMode,
  tintSupported: boolean,
  indexes: readonly number[],
): ArchitectureApply {
  if (!tintSupported && (mode === 'gray' || mode === 'mono')) return { ok: false, reason: 'unsupported' };
  if (mode !== 'original' && indexes.length === 0) return { ok: false, reason: 'missing' };
  return { ok: true, mode, indexes: [...indexes] };
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function luma(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** Keep a gray off the viewer background so black does not vanish on black, or white on white. */
export function liftContrast(value: number, backgroundLuma: number): number {
  const gap = 0.28;
  if (Math.abs(value - backgroundLuma) >= gap) return clamp01(value);
  return backgroundLuma > 0.5
    ? clamp01(Math.min(value, backgroundLuma - gap))
    : clamp01(Math.max(value, backgroundLuma + gap));
}

/**
 * Display-time color for architecture geometry only.
 * `null` means do not draw the batch. Electrical colors never pass through here.
 */
export function presentArchitectureColor(
  rgba: readonly [number, number, number, number],
  style: ArchitectureStyle,
  background: readonly [number, number, number],
): [number, number, number, number] | null {
  if (style.mode === 'hidden') return null;
  const alpha = rgba[3] === 0 ? 1 : rgba[3];
  if (style.mode === 'original') return [rgba[0], rgba[1], rgba[2], alpha];
  const backgroundLuma = luma(background);
  if (style.mode === 'mono') {
    const ink = backgroundLuma > 0.5 ? 0 : 1;
    return [ink, ink, ink, alpha];
  }
  const source = luma([rgba[0], rgba[1], rgba[2]]);
  const strength = clamp01(style.strength);
  const solid = liftContrast(source, backgroundLuma);
  const faint = liftContrast(backgroundLuma > 0.5 ? 0.2 : 0.72, backgroundLuma);
  const mixed = faint * (1 - strength) + solid * strength;
  const safe = liftContrast(mixed, backgroundLuma);
  return [safe, safe, safe, alpha];
}
