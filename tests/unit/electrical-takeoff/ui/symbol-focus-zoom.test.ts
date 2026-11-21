import { describe, expect, it } from 'vitest';
import {
  cadViewForSymbolSize,
  symbolBodyForSize,
  symbolCoverage,
  SYMBOL_FOCUS_ZOOM_DEFAULT,
} from '@/modules/electrical-takeoff/ui/viewer/symbol-focus-zoom';

describe('symbol size zoom', () => {
  it('keeps the same center and raises zoom when the slider increases', () => {
    const viewport = { width: 800, height: 600 };
    const small = cadViewForSymbolSize({ x: 40, y: -12, body: 10, viewport, level: 0 });
    const large = cadViewForSymbolSize({ x: 40, y: -12, body: 10, viewport, level: 100 });
    expect(small.panX).toBe(40);
    expect(small.panY).toBe(-12);
    expect(large.panX).toBe(40);
    expect(large.panY).toBe(-12);
    expect(large.zoom).toBeGreaterThan(small.zoom * 2);
    expect(symbolCoverage(100)).toBeGreaterThan(symbolCoverage(0));
    expect(symbolCoverage(SYMBOL_FOCUS_ZOOM_DEFAULT)).toBeGreaterThan(0.4);
    expect(symbolCoverage(SYMBOL_FOCUS_ZOOM_DEFAULT)).toBeLessThan(0.7);
  });

  it('caps a huge box so size never becomes a whole-sheet fit', () => {
    const huge = { located: true, minX: 0, minY: 0, maxX: 4000, maxY: 4000 };
    const tight = { located: true, minX: 0, minY: 0, maxX: 12, maxY: 10 };
    expect(symbolBodyForSize(huge)).toBeLessThan(60);
    expect(symbolBodyForSize(tight)).toBeGreaterThanOrEqual(8);
    expect(symbolBodyForSize(tight)).toBeLessThanOrEqual(12);
  });
});
