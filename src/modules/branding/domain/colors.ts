/**
 * Brand color validation — HEX #RRGGBB only; reject invisible / near-white-on-white.
 */

import { DomainRuleError } from '@/shared/errors';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/** Parses "#RRGGBB" → [r,g,b] 0–255. */
export function parseBrandHex(color: string): [number, number, number] | null {
  const m = HEX_RE.exec(color.trim());
  if (!m) return null;
  const hex = m[0]!;
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function isValidBrandHex(color: string): boolean {
  return parseBrandHex(color) !== null;
}

/** Normalize to uppercase #RRGGBB. */
export function normalizeBrandHex(color: string): string {
  const parsed = parseBrandHex(color);
  if (!parsed) {
    throw new DomainRuleError('Invalid brand color', 'branding.errors.invalidColor', { color });
  }
  const [r, g, b] = parsed;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function relativeLuminance(r: number, g: number, b: number): number {
  const toLinear = (c: number) => {
    const srgb = c / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const L1 = Math.max(relativeLuminance(...fg), relativeLuminance(...bg));
  const L2 = Math.min(relativeLuminance(...fg), relativeLuminance(...bg));
  return (L1 + 0.05) / (L2 + 0.05);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

/** Minimum contrast against white paper for a usable brand accent (WCAG AA large text ≈ 3:1). */
const MIN_BRAND_CONTRAST_ON_WHITE = 2.5;

/**
 * Rejects colors that are invisible on white paper (near-white / very light).
 * Returns normalized HEX.
 */
export function assertVisibleBrandColor(color: string, field = 'color'): string {
  const normalized = normalizeBrandHex(color);
  const rgb = parseBrandHex(normalized)!;
  const ratio = contrastRatio(rgb, WHITE);
  if (ratio < MIN_BRAND_CONTRAST_ON_WHITE) {
    throw new DomainRuleError(
      'Brand color is too light to see on white paper',
      'branding.errors.colorInvisible',
      { field, color: normalized, contrastOnWhite: ratio },
    );
  }
  return normalized;
}

/** Text color for overlays on the brand primary (white or black). */
export function contrastTextOnBrand(brandHex: string): '#FFFFFF' | '#000000' {
  const rgb = parseBrandHex(brandHex);
  if (!rgb) return '#FFFFFF';
  const whiteRatio = contrastRatio(WHITE, rgb);
  const blackRatio = contrastRatio(BLACK, rgb);
  return whiteRatio >= blackRatio ? '#FFFFFF' : '#000000';
}
