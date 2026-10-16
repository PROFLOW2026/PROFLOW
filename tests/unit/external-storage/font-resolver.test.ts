import { describe, expect, it } from 'vitest';
import {
  fontSearchHostPaths,
  lookupFontAcrossSearchPaths,
} from '@/modules/external-storage/ui/cad/pf-cad/font-resolver';
import { buildFileIndex } from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';

describe('font-resolver', () => {
  it('collects host and xref directories for font search', () => {
    const paths = fontSearchHostPaths('drawings/site/main.dwg', [
      'drawings/xref/sub/heb.shx',
      'other/plot.ctb',
    ]);
    expect(paths).toContain('drawings/site/main.dwg');
    expect(paths).toContain('drawings/site');
    expect(paths).toContain('drawings/xref/sub');
  });

  it('finds fonts in xref folders when missing beside host', () => {
    const index = buildFileIndex([
      {
        name: 'drawings/xref/sub/miryl.shx',
        getBytes: async () => new Uint8Array([1, 2, 3]),
      },
    ]);
    const hosts = fontSearchHostPaths('drawings/site/main.dwg', ['drawings/xref/sub/ref.dwg']);
    const hit = lookupFontAcrossSearchPaths(index, hosts, 'miryl.shx');
    expect(hit?.name).toBe('drawings/xref/sub/miryl.shx');
  });
});
