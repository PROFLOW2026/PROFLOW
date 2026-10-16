import { describe, expect, it, beforeEach } from 'vitest';
import {
  collectEntityTextStyleDiagnostics,
  entityStyleFontNameCandidates,
  tableRowsEmbeddedInEntityStyle,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-entity-text-style';
import {
  clearCadShxFonts,
  lookupShxFont,
  registerCadShxEntityStyleHeuristics,
  registerCadShxFonts,
  registerCadShxStyleTable,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-shx-registry';
import { cadFontNamesFromScene } from '@/modules/external-storage/ui/cad/pf-cad/font-resolver';

describe('cad-entity-text-style', () => {
  it('TRHEBTXT embeds host table row HEBTXT', () => {
    const rows = tableRowsEmbeddedInEntityStyle('TRHEBTXT', [
      { name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' },
      { name: 'S', font: 'sivan_m.shx' },
    ]);
    expect(rows.map((r) => r.name)).toContain('HEBTXT');
  });

  it('entityStyleFontNameCandidates strips TR prefix', () => {
    expect(entityStyleFontNameCandidates('TRHEBTXT')).toContain('HEBTXT');
  });

  it('cadFontNamesFromScene pulls fonts from embedded table rows for entity styles', () => {
    const names = cadFontNamesFromScene({
      fonts: {},
      textStyleTable: [{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }],
      texts: [{ style: 'TRHEBTXT' }],
    });
    expect(names).toContain('HEBTXT.SHX');
    expect(names).toContain('MIRYLB.SHX');
  });

  it('diagnostics mark TRHEBTXT as xref/block style with embedded HEBTXT', () => {
    const diag = collectEntityTextStyleDiagnostics({
      texts: [{ style: 'TRHEBTXT' }, { style: 'TRHEBTXT' }],
      textStyleTable: [{ name: 'HEBTXT', font: 'HEBTXT.SHX' }],
    });
    expect(diag[0]?.style).toBe('TRHEBTXT');
    expect(diag[0]?.inTextStyleTable).toBe(false);
    expect(diag[0]?.embeddedTableRows).toContain('HEBTXT');
    expect(diag[0]?.likelySource).toBe('xref_or_block_style');
  });
});

describe('registerCadShxEntityStyleHeuristics', () => {
  beforeEach(() => clearCadShxFonts());

  function minimalShx(name: string) {
    const bytes = new Uint8Array(48);
    bytes.set(new TextEncoder().encode('AutoCAD-86 shapes 1.0'), 0);
    bytes.set([0x1a, 0, 65, 3, 1, 16, 14], 24);
    return { name, bytes };
  }

  it('links TRHEBTXT to HEBTXT table fonts when SHX loaded', () => {
    registerCadShxFonts([
      minimalShx('HEBTXT.SHX'),
      minimalShx('MIRYLB.SHX'),
    ]);
    registerCadShxStyleTable([{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }]);
    const linked = registerCadShxEntityStyleHeuristics(
      [{ style: 'TRHEBTXT' }],
      [{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }],
    );
    expect(linked).toBeGreaterThan(0);
    expect(lookupShxFont('TRHEBTXT')).toBeDefined();
  });
});
