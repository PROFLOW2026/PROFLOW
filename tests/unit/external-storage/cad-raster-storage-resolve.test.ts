import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cadRasterMimeFromPath } from '@/modules/external-storage/ui/cad/pf-cad/cad-raster-mime';
import { buildFileIndex, lookupInIndex } from '@/modules/external-storage/ui/cad/pf-cad/xref-resolver';

const fixtureDir = path.join(process.cwd(), 'tests/fixtures/cad/synthetic-raster');
const tilePath = path.join(fixtureDir, 'synthetic-tile.png');

describe('cad raster storage index resolve', () => {
  it('cadRasterMimeFromPath maps common raster extensions', () => {
    expect(cadRasterMimeFromPath('ref.JPG')).toBe('image/jpeg');
    expect(cadRasterMimeFromPath('ref.webp')).toBe('image/webp');
    expect(cadRasterMimeFromPath('ref.png')).toBe('image/png');
  });

  it('lookupInIndex finds synthetic PNG by basename (viewer syncRasterScene path)', async () => {
    const bytes = readFileSync(tilePath);
    const index = buildFileIndex([
      {
        name: tilePath.replace(/\\/g, '/'),
        getBytes: async () => new Uint8Array(bytes),
      },
    ]);
    const host = '/storage/project/3621-EL/3621-EL.dwg';
    const hit = lookupInIndex(index, host, 'synthetic-tile.png');
    expect(hit).not.toBeNull();
    const loaded = await hit!.getBytes();
    expect(loaded.byteLength).toBe(bytes.byteLength);
    expect(cadRasterMimeFromPath('synthetic-tile.png')).toBe('image/png');
  });
});
