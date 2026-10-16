import { describe, expect, it } from 'vitest';
import {
  decodeShapeVectors,
  isDrawableShxCharacter,
  measureShxTextBlock,
  measureShxTextWidth,
  parseShxBigfontFile,
  parseShxFont,
  parseUnicodeShapesPayload,
  drawShxLine,
  resolveShxGlyphStroke,
  shxMissingGlyphStroke,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  resolveShxDrawContext,
  resolveShxGlyphCode,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { isShxTextRecordGpuComplete } from '@/modules/external-storage/ui/cad/pf-cad/shx-text-segments';
import type { CadText } from '@/modules/external-storage/ui/cad/pf-cad/types';

/** Horizontal stroke: pen down, code 8 dx=10 dy=0, end. */
const H_STROKE = [1, 8, 10, 0, 0];

function u16le(v: number): number[] {
  return [v & 255, (v >> 8) & 255];
}

function shapesFile(version: '1.0' | '1.1', glyphs: Array<[number, number[]]>): Uint8Array {
  const header = new TextEncoder().encode(`AutoCAD-86 shapes ${version}\r\n\x1a`);
  const bodies = glyphs.map(([code, bc]) => ({
    code,
    bytes: Uint8Array.from([0, ...(bc.at(-1) === 0 ? bc : [...bc, 0])]),
  }));
  const gap = [0x11, 0x22, 0x33, 0x44];
  const out = new Uint8Array(header.length + gap.length + 2 + bodies.length * 4 + bodies.reduce((n, b) => n + b.bytes.length, 0));
  out.set(header, 0);
  let p = header.length;
  out.set(gap, p);
  p += gap.length;
  out.set(u16le(bodies.length), p);
  p += 2;
  for (const b of bodies) {
    out.set(u16le(b.code), p);
    out.set(u16le(b.bytes.length), p + 2);
    p += 4;
  }
  for (const b of bodies) {
    out.set(b.bytes, p);
    p += b.bytes.length;
  }
  return out;
}

function unifontFile(glyphs: Array<[number, number[]]>): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 unifont 1.0\r\n\x1a');
  const info = Uint8Array.from([...'uni'].map((c) => c.charCodeAt(0)).concat(0, 8, 2, 0));
  const bodies = glyphs.map(([code, bc]) => ({
    code,
    bytes: Uint8Array.from([0, ...(bc.at(-1) === 0 ? bc : [...bc, 0])]),
  }));
  const count = bodies.length + 1;
  const out = new Uint8Array(header.length + 4 + 2 + info.length + bodies.length * 4 + bodies.reduce((n, b) => n + b.bytes.length, 0));
  out.set(header, 0);
  let p = header.length;
  out[p] = count & 255;
  out[p + 1] = (count >> 8) & 255;
  p += 4;
  out.set(u16le(info.length), p);
  p += 2;
  out.set(info, p);
  p += info.length;
  for (const b of bodies) {
    out.set(u16le(b.code), p);
    out.set(u16le(b.bytes.length), p + 2);
    p += 4;
  }
  for (const b of bodies) {
    out.set(b.bytes, p);
    p += b.bytes.length;
  }
  return out;
}

function bigfontFile(glyphs: Array<[number, number[]]>): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 bigfont 1.0\r\n\x1a');
  const bodies = glyphs.map(([code, bc]) => ({
    code,
    bytes: Uint8Array.from([0, ...(bc.at(-1) === 0 ? bc : [...bc, 0])]),
  }));
  const index = 2 + 2 + 2 + 4 + bodies.length * 8;
  const out = new Uint8Array(header.length + index + bodies.reduce((n, b) => n + b.bytes.length, 0));
  out.set(header, 0);
  let p = header.length;
  const w16 = (v: number) => {
    out[p] = v & 255;
    out[p + 1] = (v >> 8) & 255;
    p += 2;
  };
  w16(0);
  w16(bodies.length);
  w16(1);
  w16(Math.min(...bodies.map((b) => b.code)));
  w16(Math.max(...bodies.map((b) => b.code)));
  let bodyAt = header.length + index;
  for (const b of bodies) {
    w16(b.code);
    w16(b.bytes.length);
    out[p] = bodyAt & 255;
    out[p + 1] = (bodyAt >> 8) & 255;
    out[p + 2] = (bodyAt >> 16) & 255;
    out[p + 3] = (bodyAt >> 24) & 255;
    p += 4;
    bodyAt += b.bytes.length;
  }
  for (const b of bodies) {
    out.set(b.bytes, p);
    p += b.bytes.length;
  }
  return out;
}

describe('cad-shx-font', () => {
  it('decodes a pen-down code-8 run and ignores bytes after code 0', () => {
    const segs = decodeShapeVectors(new Uint8Array([1, 8, 10, 0, 0, 8, 50, 50]));
    expect(segs).toHaveLength(1);
    expect(segs[0]!.x1).toBeCloseTo(0);
    expect(segs[0]!.y1).toBeCloseTo(0);
    expect(segs[0]!.x2).toBeCloseTo(10);
    expect(segs[0]!.y2).toBeCloseTo(0);
  });

  it('parses shapes 1.0 directory (4-byte gap, not a packed shape stream)', () => {
    const bytes = shapesFile('1.0', [[65, H_STROKE]]);
    const font = parseShxFont('test.shx', bytes);
    expect(font).not.toBeNull();
    expect(font!.kind).toBe('1.0');
    expect(font!.glyphs.get(65)).toHaveLength(1);
    expect(measureShxTextWidth(font!, 'A', 10)).toBeGreaterThan(0);
  });

  it('parses shapes 1.1 directory and unifont tables separately', () => {
    const shapes11 = shapesFile('1.1', [[0x41, H_STROKE]]);
    const font = parseShxFont('uni.shx', shapes11);
    expect(font?.kind).toBe('1.1');
    expect(font?.glyphs.has(0x41)).toBe(true);

    const uni = unifontFile([[0x41, H_STROKE]]);
    const uniFont = parseShxFont('u.shx', uni);
    expect(uniFont?.kind).toBe('1.1');
    expect(uniFont?.glyphs.has(0x41)).toBe(true);
    const marker = uni.indexOf(0x1a);
    const payloadOnly = parseUnicodeShapesPayload(uni, marker + 1);
    expect(payloadOnly.has(0x41)).toBe(true);
  });

  it('parses bigfont index offsets into glyphs keyed by character code', () => {
    const heYod = 0x05d9;
    const bytes = bigfontFile([[heYod, H_STROKE]]);
    const bundle = parseShxBigfontFile('ext.shx', bytes);
    expect(bundle?.map.get(heYod)).toBe(heYod);
    expect(bundle?.font.glyphs.has(heYod)).toBe(true);
    clearCadShxFonts();
    registerCadShxFonts([{ name: 'ext.shx', bytes }]);
    expect(resolveShxGlyphCode('ext', heYod)).toBe(heYod);
    clearCadShxFonts();
  });

  it('resolveShxGlyphStroke never returns placeholder boxes (legacy shxMissingGlyphStroke is unused in draw path)', () => {
    const font = parseShxFont('test.shx', shapesFile('1.0', [[65, H_STROKE]]))!;
    expect(isDrawableShxCharacter(' ')).toBe(false);
    expect(isDrawableShxCharacter('?')).toBe(true);
    expect(resolveShxGlyphStroke(font, 0x9999, '?')).toBeNull();
    expect(shxMissingGlyphStroke(font).length).toBeGreaterThan(0);
    expect(resolveShxGlyphStroke(font, 65, 'A')?.length).toBeGreaterThan(0);
  });

  it('drawShxLine with fillWhenMissing uses TTF fill, not placeholder stroke rectangles', () => {
    const font = parseShxFont('test.shx', shapesFile('1.0', [[65, H_STROKE]]))!;
    let strokeCalls = 0;
    let fillTextCalls = 0;
    const ctx = {
      strokeStyle: '',
      fillStyle: '',
      lineWidth: 0,
      lineCap: 'butt',
      lineJoin: 'miter',
      font: '',
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {
        strokeCalls += 1;
      },
      fillText(_ch: string) {
        fillTextCalls += 1;
      },
    } as unknown as CanvasRenderingContext2D;

    drawShxLine(ctx, font, '?', 10, '#000', undefined, undefined, {
      fontPx: 10,
      family: 'Arial',
      baseFamily: 'sans-serif',
      fillWhenMissing: true,
    });
    expect(strokeCalls).toBe(0);
    expect(fillTextCalls).toBe(1);

    strokeCalls = 0;
    fillTextCalls = 0;
    drawShxLine(ctx, font, '?', 10, '#000');
    expect(strokeCalls).toBe(0);
    expect(fillTextCalls).toBe(0);
  });

  it('uses SHX metrics for block measurement', () => {
    const font = parseShxFont('test.shx', shapesFile('1.0', [[65, H_STROKE]]))!;
    const block = measureShxTextBlock(font, ['A'], 10, 1.2);
    expect(block.w).toBeGreaterThan(0);
    expect(block.descent).toBeGreaterThanOrEqual(0);
    expect(block.blockH).toBe(10);
  });
});

describe('cad-shx-registry draw context', () => {
  it('registers primary and bigfont for glyph pick', () => {
    clearCadShxFonts();
    const primary = shapesFile('1.0', [[66, H_STROKE]]);
    const code = 0x05d0;
    const big = bigfontFile([[code, H_STROKE]]);

    registerCadShxFonts([
      { name: 'miryl.shx', bytes: primary },
      { name: 'mirylb.shx', bytes: big },
    ]);

    const ctx = resolveShxDrawContext('mirylb');
    expect(ctx.primary).toBeDefined();
    expect(ctx.mapCode(code)).toBe(code);
    expect(ctx.pickFont(code, code)?.glyphs.has(code)).toBe(true);
    clearCadShxFonts();
  });

  it('GPU completeness requires real glyphs (no missing-glyph placeholders)', () => {
    clearCadShxFonts();
    registerCadShxFonts([{ name: 'test.shx', bytes: shapesFile('1.0', [[65, H_STROKE]]) }]);

    const base: CadText = {
      k: 'text',
      t: 'A',
      x: 0,
      y: 0,
      h: 2,
      r: 0,
      c: 0xff000000,
      layer: 0,
      style: 'test',
    };
    expect(isShxTextRecordGpuComplete(base, [0, 0])).toBe(true);
    expect(isShxTextRecordGpuComplete({ ...base, t: 'A?' }, [0, 0])).toBe(false);
    clearCadShxFonts();
  });
});
