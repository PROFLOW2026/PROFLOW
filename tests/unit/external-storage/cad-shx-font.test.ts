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

describe('cad-shx-font', () => {
  it('decodes a minimal shape vector run', () => {
    const spec = new Uint8Array([1, 16, 14]);
    const segs = decodeShapeVectors(spec);
    expect(segs.length).toBe(1);
    expect(segs[0]!.x2).toBeGreaterThan(segs[0]!.x1);
  });

  it('parses shapes 1.0 header and measures width', () => {
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    const font = parseShxFont('test.shx', bytes);
    expect(font).not.toBeNull();
    expect(font!.kind).toBe('1.0');
    expect(measureShxTextWidth(font!, 'A', 10)).toBeGreaterThan(0);
  });

  it('parses Unicode shapes 1.1 code points', () => {
    const bytes = new Uint8Array(64);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.1'), 0);
    bytes.set([0x1a, 0x41, 0x00, 3, 1, 16, 14], 24);
    const font = parseShxFont('uni.shx', bytes);
    expect(font?.kind).toBe('1.1');
    expect(font?.glyphs.has(0x41)).toBe(true);
    const payloadOnly = parseUnicodeShapesPayload(bytes, 25);
    expect(payloadOnly.has(0x41)).toBe(true);
  });

  it('parses bigfont map and companion glyphs', () => {
    const bytes = new Uint8Array(80);
    bytes.set(new TextEncoder().encode('AutoCAD-86 bigfont 1.0'), 0);
    const heYod = 0x05d9;
    bytes.set([0x1a, heYod & 0xff, (heYod >> 8) & 0xff, 65, 0, 0, 0, 65, 3, 1, 16, 14], 28);
    const bundle = parseShxBigfontFile('ext.shx', bytes);
    expect(bundle?.map.get(heYod)).toBe(65);
    expect(bundle?.font.glyphs.has(65)).toBe(true);
    clearCadShxFonts();
    registerCadShxFonts([{ name: 'ext.shx', bytes }]);
    expect(resolveShxGlyphCode('ext', heYod)).toBe(65);
    clearCadShxFonts();
  });

  it('resolveShxGlyphStroke never returns placeholder boxes (legacy shxMissingGlyphStroke is unused in draw path)', () => {
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    const font = parseShxFont('test.shx', bytes)!;
    expect(isDrawableShxCharacter(' ')).toBe(false);
    expect(isDrawableShxCharacter('?')).toBe(true);
    expect(resolveShxGlyphStroke(font, 0x9999, '?')).toBeNull();
    expect(shxMissingGlyphStroke(font).length).toBeGreaterThan(0);
    expect(resolveShxGlyphStroke(font, 65, 'A')?.length).toBeGreaterThan(0);
  });

  it('drawShxLine with fillWhenMissing uses TTF fill, not placeholder stroke rectangles', () => {
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    const font = parseShxFont('test.shx', bytes)!;
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
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    const font = parseShxFont('test.shx', bytes)!;
    const block = measureShxTextBlock(font, ['A'], 10, 1.2);
    expect(block.w).toBeGreaterThan(0);
    expect(block.descent).toBeGreaterThanOrEqual(0);
    expect(block.blockH).toBe(10);
  });
});

describe('cad-shx-registry draw context', () => {
  it('registers primary and bigfont for glyph pick', () => {
    clearCadShxFonts();
    const primary = new Uint8Array(48);
    primary.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    primary.set([0x1a, 0, 66, 3, 1, 16, 14], 24);

    const big = new Uint8Array(80);
    big.set(new TextEncoder().encode('AutoCAD-86 bigfont 1.0'), 0);
    const code = 0x05d0;
    big.set([0x1a, code & 0xff, (code >> 8) & 0xff, 65, 0, 0, 0, 65, 3, 1, 16, 14], 28);

    registerCadShxFonts([
      { name: 'miryl.shx', bytes: primary },
      { name: 'mirylb.shx', bytes: big },
    ]);

    const ctx = resolveShxDrawContext('mirylb');
    expect(ctx.primary).toBeDefined();
    expect(ctx.mapCode(code)).toBe(65);
    expect(ctx.pickFont(code, 65)?.glyphs.has(65)).toBe(true);
    clearCadShxFonts();
  });

  it('GPU completeness requires real glyphs (no missing-glyph placeholders)', () => {
    clearCadShxFonts();
    const primary = new Uint8Array(48);
    primary.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    primary.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    registerCadShxFonts([{ name: 'test.shx', bytes: primary }]);

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
