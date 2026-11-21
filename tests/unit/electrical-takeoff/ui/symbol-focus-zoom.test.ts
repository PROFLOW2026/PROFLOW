import { describe, expect, it } from 'vitest';
import {
  highlightMarkerRadiusPx,
  highlightRingRadiusPx,
  HIGHLIGHT_MARKER_RADIUS_MAX_PX,
  HIGHLIGHT_MARKER_RADIUS_MIN_PX,
  SYMBOL_FOCUS_ZOOM_DEFAULT,
} from '@/modules/electrical-takeoff/ui/viewer/symbol-focus-zoom';

describe('highlight marker size', () => {
  it('grows in screen pixels when the slider increases, independent of CAD zoom', () => {
    const small = highlightMarkerRadiusPx(0, 1);
    const mid = highlightMarkerRadiusPx(SYMBOL_FOCUS_ZOOM_DEFAULT, 1);
    const large = highlightMarkerRadiusPx(100, 1);
    expect(small).toBe(HIGHLIGHT_MARKER_RADIUS_MIN_PX);
    expect(large).toBe(HIGHLIGHT_MARKER_RADIUS_MAX_PX);
    expect(mid).toBeGreaterThan(small);
    expect(mid).toBeLessThan(large);
    expect(highlightMarkerRadiusPx(100, 2)).toBe(HIGHLIGHT_MARKER_RADIUS_MAX_PX * 2);
  });

  it('grows the orange ring past the accessory on screen without changing CAD zoom', () => {
    const slider = highlightMarkerRadiusPx(SYMBOL_FOCUS_ZOOM_DEFAULT, 1);
    expect(highlightRingRadiusPx(40, slider, 6)).toBe(46);
    expect(highlightRingRadiusPx(10, slider, 6)).toBe(slider);
    expect(highlightRingRadiusPx(null, slider, 6)).toBe(slider);
    expect(highlightRingRadiusPx(0.4, slider, 6)).toBe(slider);
  });
});
