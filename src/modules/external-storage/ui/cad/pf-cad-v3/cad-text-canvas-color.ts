import { colorBitsToRgba01 } from './renderer/segment-format';

/** Dark CAD viewer chrome (Normal mode). */
export const PF_CAD_NORMAL_VIEW_BG = { r: 10, g: 14, b: 20 } as const;

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: { r: number; g: number; b: number }, bg: typeof PF_CAD_NORMAL_VIEW_BG): number {
  const l1 = relativeLuminance(fg.r, fg.g, fg.b);
  const l2 = relativeLuminance(bg.r / 255, bg.g / 255, bg.b / 255);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Canvas stroke/fill from WASM packed display color (RGB low 24 bits, opacity high byte). */
export function cadTextCanvasPaint(
  packed: number,
  options?: { plotView?: boolean },
): { fillStyle: string; globalAlpha: number } {
  const [r01, g01, b01, a] = colorBitsToRgba01(packed >>> 0);
  let r = Math.round(r01 * 255);
  let g = Math.round(g01 * 255);
  let b = Math.round(b01 * 255);

  if (!options?.plotView) {
    const fg = { r: r01, g: g01, b: b01 };
    if (contrastRatio(fg, PF_CAD_NORMAL_VIEW_BG) < 3) {
      const target = 0.82;
      r = Math.round(r + (255 - r) * target);
      g = Math.round(g + (255 - g) * target);
      b = Math.round(b + (255 - b) * target);
    }
  }

  const fillStyle = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  return { fillStyle, globalAlpha: a };
}
