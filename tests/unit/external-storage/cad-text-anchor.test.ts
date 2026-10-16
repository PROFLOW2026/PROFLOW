import { describe, expect, it } from 'vitest';
import {
  anchorOffset,
  attachmentToAlign,
  CAP_HEIGHT_RATIO,
  FONT_SIZE_FACTOR,
  mirrorScale,
} from '@/modules/external-storage/ui/cad/pf-cad/draw-cad-text';
import { maybeDecodeHebrewShxText } from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';

describe('cad text anchor math', () => {
  it('uses Noto cap height constants', () => {
    expect(CAP_HEIGHT_RATIO).toBeCloseTo(0.714, 3);
    expect(FONT_SIZE_FACTOR).toBeCloseTo(1 / 0.714, 3);
  });

  it('maps MTEXT attachment 1–9 to ha/va', () => {
    expect(attachmentToAlign(1)).toEqual({ ha: 0, va: 0 });
    expect(attachmentToAlign(5)).toEqual({ ha: 1, va: 1 });
    expect(attachmentToAlign(9)).toEqual({ ha: 2, va: 2 });
  });

  it('offsets horizontally by alignment', () => {
    const capH = 10;
    const descent = 2;
    expect(anchorOffset(0, 0, 100, capH, descent).dx).toBe(0);
    expect(anchorOffset(1, 0, 100, capH, descent).dx).toBe(-50);
    expect(anchorOffset(2, 0, 100, capH, descent).dx).toBe(-100);
  });

  it('treats WASM mirror booleans as identity unless true', () => {
    expect(mirrorScale(false)).toBe(1);
    expect(mirrorScale(true)).toBe(-1);
    expect(mirrorScale(undefined)).toBe(1);
  });

  it('offsets vertically for bottom, middle, and top', () => {
    const w = 40;
    const capH = 10;
    const descent = 2;
    const blockH = 22;
    expect(anchorOffset(0, 0, w, capH, descent, blockH).dy).toBe(0);
    expect(anchorOffset(0, 1, w, capH, descent, blockH).dy).toBe(-20);
    expect(anchorOffset(0, 2, w, capH, descent, blockH).dy).toBe(-14);
    expect(anchorOffset(0, 3, w, capH, descent, blockH).dy).toBe(-22);
  });
});

describe('hebrew SHX decode', () => {
  it('maps keyboard-latin placeholder to Hebrew for Hebrew SHX styles', () => {
    const decoded = maybeDecodeHebrewShxText('neuo anur', 'HEBTXT');
    expect(decoded).toBe('מקום שמור');
  });
});
