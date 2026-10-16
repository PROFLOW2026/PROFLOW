import { describe, expect, it } from 'vitest';
import {
  cadFontNamesFromScene,
  fontLookupCandidates,
  lookupFontInIndex,
} from '@/modules/external-storage/ui/cad/pf-cad/font-resolver';
import { buildFileIndex } from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';

describe('cad-font-resolver', () => {
  it('expands font lookup candidates across case and extension', () => {
    const c = fontLookupCandidates('MIRYL');
    expect(c.some((x) => x.toLowerCase() === 'miryl.shx')).toBe(true);
    expect(c.some((x) => x.toUpperCase() === 'MIRYL.SHX')).toBe(true);
  });

  it('resolves fonts by basename case-insensitively from the index', async () => {
    const index = buildFileIndex([
      {
        name: 'folder/miryl.shx',
        getBytes: async () => new Uint8Array([1, 2, 3]),
      },
    ]);
    const hit = lookupFontInIndex(index, '3096-el.dwg', 'MIRYL.SHX');
    expect(hit?.name).toBe('folder/miryl.shx');
    expect(await hit!.getBytes()).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('merges text style table font file names into resolve name set', () => {
    const names = cadFontNamesFromScene({
      fonts: { simplex: 1 },
      textStyleTable: [{ name: 'TRHEBTXT', font: 'MIRYL.SHX', big: 'MIRYLB.SHX' }],
    });
    expect(names).toContain('simplex');
    expect(names).toContain('MIRYL.SHX');
    expect(names).toContain('MIRYLB.SHX');
  });

  it('includes entity-only styles and embedded table fonts in resolve name set', () => {
    const names = cadFontNamesFromScene({
      fonts: {},
      textStyleTable: [{ name: 'HEBTXT', font: 'HEBTXT.SHX' }],
      texts: [{ style: 'TRHEBTXT' }],
    });
    expect(names).toContain('HEBTXT.SHX');
    expect(names).toContain('TRHEBTXT');
  });
});
