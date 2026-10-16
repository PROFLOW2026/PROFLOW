import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCadShxFonts,
  lookupShxFont,
  registerCadShxFonts,
  registerCadShxStyleTable,
  registerCadShxTextStyleAliases,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';

function minimalShapesFont(name: string, shapeNum: number): Uint8Array {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
  bytes.set([0x1a, 0, shapeNum, 3, 1, 16, 14], 24);
  return bytes;
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

  it('registerCadShxTextStyleAliases is idempotent when fonts already keyed', () => {
    registerCadShxFonts([{ name: 'romans.shx', bytes: minimalShapesFont('romans.shx', 65) }]);
    expect(lookupShxFont('ROMANS')).toBeDefined();
    expect(registerCadShxTextStyleAliases([{ style: 'ROMANS' }])).toBe(0);
  });
});
