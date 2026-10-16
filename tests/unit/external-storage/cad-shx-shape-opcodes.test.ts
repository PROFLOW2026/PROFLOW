import { describe, expect, it } from 'vitest';
import {
  decodeShapeVectors,
  decodeShapeVectorsDetailed,
  parseShxFont,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';

function shapes10(entries: { code: number; body: number[] }[]): Uint8Array {
  const head = new TextEncoder().encode('AutoCAD-86 shapes 1.0\r\n\x1a');
  const dir = new Uint8Array(6 + entries.length * 4);
  dir[4] = entries.length & 0xff;
  dir[5] = (entries.length >> 8) & 0xff;
  const bodies: number[] = [];
  entries.forEach((entry, index) => {
    const o = 6 + index * 4;
    dir[o] = entry.code & 0xff;
    dir[o + 1] = (entry.code >> 8) & 0xff;
    dir[o + 2] = entry.body.length & 0xff;
    dir[o + 3] = (entry.body.length >> 8) & 0xff;
    bodies.push(...entry.body);
  });
  const out = new Uint8Array(head.length + dir.length + bodies.length);
  out.set(head, 0);
  out.set(dir, head.length);
  out.set(new Uint8Array(bodies), head.length + dir.length);
  return out;
}

function near(
  seg: { x1: number; y1: number; x2: number; y2: number },
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  expect(seg.x1).toBeCloseTo(x1, 4);
  expect(seg.y1).toBeCloseTo(y1, 4);
  expect(seg.x2).toBeCloseTo(x2, 4);
  expect(seg.y2).toBeCloseTo(y2, 4);
}

describe('SHX shape opcodes', () => {
  it('code 0 ends the shape and ignores following bytes', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 4, 0, 0, 1, 8, 100, 100]));
    expect(segs).toHaveLength(1);
    near(segs[0]!, 0, 0, 4, 0);
  });

  it('pen up suppresses a vector and pen down emits it', () => {
    expect(decodeShapeVectors(new Uint8Array([2, 0x14]))).toHaveLength(0);
    const down = decodeShapeVectors(new Uint8Array([1, 0x14]));
    expect(down).toHaveLength(1);
    near(down[0]!, 0, 0, 0, 1);
  });

  it('code 8 displacement draws the two specified strokes', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 10, 0, 8, 0, 20, 0]));
    expect(segs).toHaveLength(2);
    near(segs[0]!, 0, 0, 10, 0);
    near(segs[1]!, 10, 0, 10, 20);
  });

  it('vector 0x14 is length 1 at 90 degrees', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 0x14, 0]));
    expect(segs).toHaveLength(1);
    near(segs[0]!, 0, 0, 0, 1);
  });

  it('code 3 divides subsequent vector length and stacks with code 4', () => {
    const halved = decodeShapeVectors(new Uint8Array([1, 3, 2, 0x14, 0]));
    expect(halved).toHaveLength(1);
    near(halved[0]!, 0, 0, 0, 0.5);

    const stacked = decodeShapeVectors(new Uint8Array([1, 4, 3, 3, 2, 8, 2, 0, 0]));
    expect(stacked).toHaveLength(1);
    near(stacked[0]!, 0, 0, 3, 0);

    const skipped = decodeShapeVectors(new Uint8Array([1, 3, 0, 0x14]));
    expect(skipped).toHaveLength(1);
    near(skipped[0]!, 0, 0, 0, 1);
  });

  it('code 12 bulge 0 is a straight line', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 12, 10, 0, 0, 0]));
    expect(segs).toHaveLength(1);
    near(segs[0]!, 0, 0, 10, 0);
  });

  it('letter-like E is three code-8 strokes', () => {
    const segs = decodeShapeVectors(
      new Uint8Array([1, 8, 0, 12, 8, 8, 0, 2, 8, 0, 244, 8, 248, 0, 1, 8, 8, 0, 0]),
    );
    expect(segs).toHaveLength(3);
    near(segs[0]!, 0, 0, 0, 12);
    near(segs[1]!, 0, 12, 8, 12);
    near(segs[2]!, 0, 0, 8, 0);
  });

  it('digit-like 1 uses code 8 for a base and a stem', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 4, 0, 2, 8, 254, 0, 1, 8, 0, 12, 0]));
    expect(segs).toHaveLength(2);
    near(segs[0]!, 0, 0, 4, 0);
    near(segs[1]!, 2, 0, 2, 12);
  });

  it('plus is two code-8 segments', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 10, 0, 2, 8, 251, 5, 1, 8, 0, 246, 0]));
    expect(segs).toHaveLength(2);
    near(segs[0]!, 0, 0, 10, 0);
    near(segs[1]!, 5, 5, 5, -5);
  });

  it('code 14 skips the next command, including a vector byte', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 14, 0x18, 0x14]));
    expect(segs).toHaveLength(1);
    near(segs[0]!, 0, 0, 0, 1);
  });

  it('code 9 stops on (0,0) and does not draw the terminator', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 9, 4, 0, 0, 5, 0, 0, 0]));
    expect(segs).toHaveLength(2);
    near(segs[0]!, 0, 0, 4, 0);
    near(segs[1]!, 4, 0, 4, 5);
  });

  it('code 6 pops without drawing a segment back to the saved point', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 5, 0, 5, 8, 0, 4, 6, 8, 3, 0, 0]));
    expect(segs).toHaveLength(3);
    near(segs[0]!, 0, 0, 5, 0);
    near(segs[1]!, 5, 0, 5, 4);
    near(segs[2]!, 5, 0, 8, 0);
  });

  it('vector 0x12 uses the Autodesk (1, 1) diagonal, not a unit circle step', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 0x12, 0]));
    expect(segs).toHaveLength(1);
    near(segs[0]!, 0, 0, 1, 1);
  });

  it('octant spec 0x04 is start octant 0 spanning 4 (180 degrees CCW)', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 10, 4, 0x04, 0]));
    expect(segs.length).toBeGreaterThan(4);
    expect(segs[0]!.x1).toBeCloseTo(0, 4);
    expect(segs[0]!.y1).toBeCloseTo(0, 4);
    const end = segs[segs.length - 1]!;
    expect(end.x2).toBeCloseTo(-8, 3);
    expect(end.y2).toBeCloseTo(0, 3);
  });
});

describe('SHX command 7 subshapes', () => {
  it('draws a subshape at the parent pen and keeps the following stroke', () => {
    const lookup = (n: number) =>
      n === 2 ? new Uint8Array([1, 8, 5, 0, 0]) : undefined;
    const decoded = decodeShapeVectorsDetailed(new Uint8Array([1, 7, 2, 0x14, 0]), lookup);
    expect(decoded.complete).toBe(true);
    expect(decoded.segments).toHaveLength(2);
    near(decoded.segments[0]!, 0, 0, 5, 0);
    near(decoded.segments[1]!, 5, 0, 5, 1);
  });

  it('places a second subshape after the first and applies parent scale', () => {
    const lookup = (n: number) => {
      if (n === 2) return new Uint8Array([1, 8, 10, 0, 0]);
      if (n === 3) return new Uint8Array([1, 8, 0, 6, 0]);
      return undefined;
    };
    const decoded = decodeShapeVectorsDetailed(new Uint8Array([4, 2, 7, 2, 7, 3, 0]), lookup);
    expect(decoded.complete).toBe(true);
    expect(decoded.segments).toHaveLength(2);
    near(decoded.segments[0]!, 0, 0, 20, 0);
    near(decoded.segments[1]!, 20, 0, 20, 12);
    expect(decoded.endX).toBeCloseTo(20, 4);
    expect(decoded.endY).toBeCloseTo(12, 4);
  });

  it('does not let a subshape scale leak into the parent', () => {
    const lookup = (n: number) =>
      n === 2 ? new Uint8Array([4, 5, 1, 8, 1, 0, 0]) : undefined;
    const decoded = decodeShapeVectorsDetailed(new Uint8Array([1, 7, 2, 8, 4, 0, 0]), lookup);
    expect(decoded.complete).toBe(true);
    near(decoded.segments[0]!, 0, 0, 5, 0);
    near(decoded.segments[1]!, 5, 0, 9, 0);
  });

  it('marks a missing subshape incomplete and keeps the strokes that were drawn', () => {
    const decoded = decodeShapeVectorsDetailed(
      new Uint8Array([1, 8, 4, 0, 7, 9, 0]),
      () => undefined,
    );
    expect(decoded.complete).toBe(false);
    expect(decoded.segments).toHaveLength(1);
    near(decoded.segments[0]!, 0, 0, 4, 0);
  });

  it('stops a subshape cycle without treating the glyph as complete', () => {
    const bytes = new Uint8Array([7, 1, 1, 8, 3, 0, 0]);
    const decoded = decodeShapeVectorsDetailed(bytes, (n) => (n === 1 ? bytes : undefined));
    expect(decoded.complete).toBe(false);
    expect(decoded.segments.length).toBeLessThan(8);
  });

  it('stops when subshape depth exceeds 8', () => {
    const lookup = (n: number) => {
      if (n >= 2 && n <= 10) return new Uint8Array([7, n + 1]);
      if (n === 11) return new Uint8Array([1, 8, 1, 0, 0]);
      return undefined;
    };
    const decoded = decodeShapeVectorsDetailed(new Uint8Array([7, 2]), lookup);
    expect(decoded.complete).toBe(false);
    expect(decoded.segments).toHaveLength(0);
  });

  it('marks an extended bigfont subshape incomplete instead of reading its metrics as commands', () => {
    const decoded = decodeShapeVectorsDetailed(
      new Uint8Array([7, 0, 2, 0, 1, 2, 3, 4, 1, 8, 4, 0, 0]),
      () => new Uint8Array([1, 8, 50, 0, 0]),
      0,
      new Set(),
      'bigfont',
    );
    expect(decoded.complete).toBe(false);
    expect(decoded.segments).toHaveLength(1);
    near(decoded.segments[0]!, 0, 0, 4, 0);
  });

  it('resolves subshapes from the shapes directory and flags the parent when one is missing', () => {
    const font = parseShxFont(
      'sub.shx',
      shapes10([
        { code: 2, body: [0, 1, 8, 10, 0, 0] },
        { code: 65, body: [0, 7, 2, 7, 99, 1, 8, 2, 0, 0] },
      ]),
    );
    expect(font).not.toBeNull();
    expect(font!.incompleteGlyphs?.has(65)).toBe(true);
    expect(font!.incompleteGlyphs?.has(2)).toBe(false);
    const glyph = font!.glyphs.get(65)!;
    expect(glyph).toHaveLength(2);
    near(glyph[0]!, 0, 0, 10, 0);
    near(glyph[1]!, 10, 0, 12, 0);
  });
});
