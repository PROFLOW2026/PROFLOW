import { describe, expect, it } from 'vitest';
import {
  collectEntityTextStyleDiagnostics,
  entityStyleFontNameCandidates,
  tableRowsEmbeddedInEntityStyle,
} from '@/modules/external-storage/ui/cad/pf-cad/cad-entity-text-style';
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

  it('cadFontNamesFromScene uses report.fonts and textStyleTable only', () => {
    const names = cadFontNamesFromScene({
      fonts: { simplex: 1 },
      textStyleTable: [{ name: 'HEBTXT', font: 'HEBTXT.SHX', big: 'MIRYLB.SHX' }],
      texts: [{ style: 'TRHEBTXT' }],
    });
    expect(names).toContain('simplex');
    expect(names).toContain('HEBTXT.SHX');
    expect(names).toContain('MIRYLB.SHX');
    expect(names).not.toContain('TRHEBTXT');
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
