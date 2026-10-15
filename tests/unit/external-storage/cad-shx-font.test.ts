import { describe, expect, it } from 'vitest';
import { decodeShapeVectors, measureShxTextWidth, parseShxFont } from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';

describe('cad-shx-font', () => {
  it('decodes a minimal shape vector run', () => {
    const spec = new Uint8Array([1, 16, 14]);
    const segs = decodeShapeVectors(spec);
    expect(segs.length).toBe(1);
    expect(segs[0]!.x2).toBeGreaterThan(segs[0]!.x1);
  });

  it('parses shapes header and measures width', () => {
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    const font = parseShxFont('test.shx', bytes);
    expect(font).not.toBeNull();
    expect(measureShxTextWidth(font!, 'A', 10)).toBeGreaterThan(0);
  });
});
