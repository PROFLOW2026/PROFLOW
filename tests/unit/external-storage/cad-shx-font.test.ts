import { describe, expect, it } from 'vitest';
import {
  decodeShapeVectors,
  measureShxTextBlock,
  measureShxTextWidth,
  parseShxBigfontFile,
  parseShxFont,
  parseUnicodeShapesPayload,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-font';
import {
  clearCadShxFonts,
  registerCadShxFonts,
  resolveShxDrawContext,
  resolveShxGlyphCode,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';

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
});
