import { describe, expect, it } from 'vitest';
import {
  highlightMarkerRadiusPx,
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
});
