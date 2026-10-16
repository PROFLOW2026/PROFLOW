import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearCadShxFonts,
  lookupShxFont,
  registerCadShxEntityStylePrefixBindings,
  registerCadShxFonts,
  registerCadShxTextStyleAliases,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';

const syntheticShxDir = path.join(process.cwd(), 'tests/fixtures/cad/synthetic-shx');

afterEach(() => clearCadShxFonts());

describe('registerCadShxEntityStylePrefixBindings', () => {
  it('binds TRHEBTXT to loaded HEBTXT SHX via TR prefix variant', () => {
    registerCadShxFonts([
      {
        name: 'HEBTXT.SHX',
        bytes: new Uint8Array(fs.readFileSync(path.join(syntheticShxDir, 'HEBTXT.SHX'))),
      },
    ]);
    registerCadShxTextStyleAliases([{ style: 'HEBTXT' }]);
    expect(lookupShxFont('HEBTXT')).toBeDefined();
    expect(lookupShxFont('TRHEBTXT')).toBeUndefined();

    const linked = registerCadShxEntityStylePrefixBindings([{ style: 'TRHEBTXT' }]);
    expect(linked).toBe(1);
    expect(lookupShxFont('TRHEBTXT')).toBeDefined();
  });
});
