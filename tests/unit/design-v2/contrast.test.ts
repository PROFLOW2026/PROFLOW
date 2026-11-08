import { describe, expect, it } from "vitest";

/** WCAG 2.x relative luminance contrast (hex sRGB). */
function linearChannel(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return 0.2126 * linearChannel(r) + 0.7152 * linearChannel(g) + 0.0722 * linearChannel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(foreground);
  const bg = relativeLuminance(background);
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

type LockedPair = {
  id: string;
  foreground: string;
  background: string;
  minRatio: number;
};

/** EXLFY Design V2 locked pairs — text >= 4.5, UI chrome >= 3. */
const LOCKED_CONTRAST: LockedPair[] = [
  { id: "premium-light-primary", foreground: "#ffffff", background: "#0b665f", minRatio: 4.5 },
  { id: "premium-light-primary-hover", foreground: "#ffffff", background: "#0b524c", minRatio: 4.5 },
  { id: "premium-light-primary-active", foreground: "#ffffff", background: "#0b433f", minRatio: 4.5 },
  { id: "premium-dark-primary", foreground: "#04201d", background: "#36b8a8", minRatio: 4.5 },
  { id: "premium-dark-primary-hover", foreground: "#04201d", background: "#4cd0c0", minRatio: 4.5 },
  { id: "premium-dark-primary-active", foreground: "#04201d", background: "#5fd3c4", minRatio: 4.5 },
  { id: "premium-light-rail-text", foreground: "#11181b", background: "#ffffff", minRatio: 4.5 },
  { id: "premium-light-rail-muted", foreground: "#566165", background: "#ffffff", minRatio: 4.5 },
  { id: "premium-light-ink-indicator", foreground: "#172025", background: "#ffffff", minRatio: 3 },
  { id: "modern-light-primary", foreground: "#ffffff", background: "#0a6b63", minRatio: 4.5 },
  { id: "modern-dark-primary", foreground: "#04201d", background: "#2bb3a3", minRatio: 4.5 },
  {
    id: "classic-dark-primary",
    foreground: "#ffffff",
    background: "#228f88",
    minRatio: 3,
  },
];

describe("EXLFY Design V2 locked contrast", () => {
  it.each(LOCKED_CONTRAST)("$id meets >= $minRatio:1", ({ foreground, background, minRatio }) => {
    const ratio = contrastRatio(foreground, background);
    expect(ratio).toBeGreaterThanOrEqual(minRatio);
  });

  it("classic dark primary stays in the documented UI band (not forced to 4.5 text)", () => {
    const ratio = contrastRatio("#ffffff", "#228f88");
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
    expect(Math.round(ratio * 100) / 100).toBe(3.92);
  });
});