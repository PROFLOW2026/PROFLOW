import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCadShxFonts,
  lookupShxFont,
  registerCadShxEntityStylePrefixBindings,
  registerCadShxFonts,
  registerCadShxTextStyleAliases,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';

function minimalShapesFont(shapeNum: number): Uint8Array {
  const header = new TextEncoder().encode('AutoCAD-86 shapes 1.0\r\n\x1a');
  const body = Uint8Array.from([0, 1, 0x14, 0]);
  const out = new Uint8Array(header.length + 4 + 2 + 4 + body.length);
  out.set(header, 0);
  let p = header.length + 4;
  out[p] = 1;
  p += 2;
  out[p] = shapeNum & 255;
  out[p + 2] = body.length & 255;
  out.set(body, p + 4);
  return out;
}

afterEach(() => clearCadShxFonts());

describe('registerCadShxEntityStylePrefixBindings', () => {
  it('binds TRHEBTXT to loaded HEBTXT SHX via TR prefix variant', () => {
    registerCadShxFonts([{ name: 'HEBTXT.SHX', bytes: minimalShapesFont(65) }]);
    registerCadShxTextStyleAliases([{ style: 'HEBTXT' }]);
    expect(lookupShxFont('HEBTXT')).toBeDefined();
    expect(lookupShxFont('TRHEBTXT')).toBeUndefined();

    const linked = registerCadShxEntityStylePrefixBindings([{ style: 'TRHEBTXT' }]);
    expect(linked).toBe(1);
    expect(lookupShxFont('TRHEBTXT')).toBeDefined();
  });
});
