import { describe, expect, it } from 'vitest';
import { cadInsertFocusExtent, cadSymbolFocusExtent } from '@/modules/electrical-takeoff/domain/cad-sheet-frame';
import {
  insertHalfForSymbolFocus,
  padFactorForSymbolFocus,
  SYMBOL_FOCUS_ZOOM_DEFAULT,
} from '@/modules/electrical-takeoff/ui/viewer/symbol-focus-zoom';

describe('symbol focus zoom', () => {
  it('makes a close setting a tighter window than a wide setting', () => {
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const wide = cadSymbolFocusExtent(box, padFactorForSymbolFocus(0));
    const close = cadSymbolFocusExtent(box, padFactorForSymbolFocus(100));
    expect(close[2] - close[0]).toBeLessThan(wide[2] - wide[0]);
    expect(close[2] - close[0]).toBeGreaterThan(10);
    const defaultPad = padFactorForSymbolFocus(SYMBOL_FOCUS_ZOOM_DEFAULT);
    expect(defaultPad).toBeGreaterThan(0.2);
    expect(defaultPad).toBeLessThan(0.55);
  });

  it('keeps an insert fully inside the window and scales with the slider', () => {
    const wide = cadInsertFocusExtent(0, 0, insertHalfForSymbolFocus(0));
    const close = cadInsertFocusExtent(0, 0, insertHalfForSymbolFocus(100));
    expect(close[2] - close[0]).toBeLessThan(wide[2] - wide[0]);
    expect(close[2] - close[0]).toBeGreaterThan(16);
  });
});
