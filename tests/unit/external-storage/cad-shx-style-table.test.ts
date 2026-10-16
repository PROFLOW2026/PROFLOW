import { afterEach, describe, expect, it } from 'vitest';
import { textStyleFontFiles } from '@/modules/external-storage/ui/cad/pf-cad/cad-entity-text-style';
import {
  clearCadShxFonts,
  lookupShxFont,
  registerCadShxFonts,
  registerCadShxStyleTable,
  registerCadShxTextStyleAliases,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { resolveTextEncoding } from '@/modules/external-storage/ui/cad/pf-cad/hebrew-shx-decode';

/** Shapes 1.0 with one pen-down vector so the current SHX parser keeps the glyph. */
function minimalShapesFont(_name: string, shapeNum: number): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 shapes 1.0\r\n');
  const body = Uint8Array.of(0x41, 0x00, 0x01, 0x14, 0x00);
  const directory = new Uint8Array(10);
  directory[4] = 1;
  directory[6] = shapeNum & 0xff;
  directory[7] = (shapeNum >> 8) & 0xff;
  directory[8] = body.length;
  const out = new Uint8Array(header.length + 1 + directory.length + body.length);
  out.set(header, 0);
  out[header.length] = 0x1a;
  out.set(directory, header.length + 1);
  out.set(body, header.length + 1 + directory.length);
  return out;
}

afterEach(() => {
  clearCadShxFonts();
});

describe('cad-shx-style-table', () => {
  it('binds DWG style names to loaded SHX font files', () => {
    registerCadShxFonts([{ name: 'MIRYL.SHX', bytes: minimalShapesFont('MIRYL.SHX', 65) }]);
    expect(lookupShxFont('MIRYL.SHX')).toBeDefined();
    expect(lookupShxFont('TRHEBTXT')).toBeUndefined();

    const linked = registerCadShxStyleTable([
      { name: 'TRHEBTXT', font: 'MIRYL.SHX' },
      { name: 'HEBTXT', font: 'HEBTXT.SHX' },
    ]);
    expect(linked).toBe(1);
    expect(lookupShxFont('TRHEBTXT')).toBeDefined();
    expect(lookupShxFont('trhebtxt')).toBeDefined();
    expect(lookupShxFont('HEBTXT')).toBeUndefined();
  });

  it('resolves style S through the font file sivan_m.shx, not the one-letter name', () => {
    const table = [
      { name: 'S', font: 'sivan_m.shx' },
      { name: 'STANDARD', font: 'txt.shx' },
    ];
    const files = textStyleFontFiles('S', table);
    expect(files).toEqual({ fontFile: 'sivan_m.shx', bigFontFile: '' });
    expect(textStyleFontFiles('STANDARD', table).fontFile).toBe('txt.shx');
    const decoded = resolveTextEncoding({
      text: '\u02DC\u20AC\u2122',
      styleName: 'S',
      fontFile: files.fontFile,
      bigFontFile: files.bigFontFile,
    });
    expect(decoded.text).toBe('ראש');
    expect(decoded.source).toBe('font-file');
    expect(decoded.profile).toBe('hebrew-shx');
  });

  it('registerCadShxTextStyleAliases is idempotent when fonts already keyed', () => {
    registerCadShxFonts([{ name: 'romans.shx', bytes: minimalShapesFont('romans.shx', 65) }]);
    expect(lookupShxFont('ROMANS')).toBeDefined();
    expect(registerCadShxTextStyleAliases([{ style: 'ROMANS' }])).toBe(0);
  });
});
