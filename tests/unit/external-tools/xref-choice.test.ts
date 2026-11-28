import { describe, expect, it } from 'vitest';
import { manualChoiceKey } from '@/modules/external-tools/domain/identity';
import { buildFileIndex, collectXrefClosure, lookupInIndex, type CadIndexedFile } from '@/modules/external-storage/ui/cad/pf-cad-v3/xref-resolver';

function file(name: string, logicalId: string): CadIndexedFile {
  return { name, logicalId, sizeBytes: 4, getBytes: async () => new Uint8Array() };
}

describe('manual xref choice', () => {
  it('does not auto-pick when two files share a name, and keeps an absolute path distinct', () => {
    const index = buildFileIndex([
      file('plans/a.dwg', 'one'),
      file('archive/a.dwg', 'two'),
      file('other/b.dwg', 'three'),
    ]);
    expect(lookupInIndex(index, 'host.dwg', 'a.dwg')).toBeNull();
    expect(lookupInIndex(index, 'host.dwg', 'plans/a.dwg')?.logicalId).toBe('one');
    expect(lookupInIndex(index, 'host.dwg', 'b.dwg')?.logicalId).toBe('three');
    expect(lookupInIndex(index, 'host.dwg', 'C:/drawings/a.dwg')).toBeNull();
    expect(lookupInIndex(index, 'host.dwg', '')).toBeNull();
  });

  it('finds 3643 nested backgrounds only when the host path includes the selected folder', () => {
    const index = buildFileIndex([
      file('3643-EL - Standard/3643-EL.dwg', 'host'),
      file('3643-EL - Standard/02.06.26/vtk-100_Layout1.dwg', 'bg-a'),
      file('3643-EL - Standard/15.06.26/vtk-103.dwg', 'bg-b'),
    ]);
    expect(
      lookupInIndex(index, '3643-EL.dwg', '.\\15.06.26\\vtk-103.dwg'),
    ).toBeNull();
    expect(
      lookupInIndex(index, '3643-EL - Standard/3643-EL.dwg', '.\\15.06.26\\vtk-103.dwg')?.logicalId,
    ).toBe('bg-b');
    expect(
      lookupInIndex(
        index,
        '3643-EL - Standard/3643-EL.dwg',
        '.\\02.06.26\\vtk-100_Layout1.dwg',
      )?.logicalId,
    ).toBe('bg-a');
  });

  it('loads the chosen file when two files share a name', async () => {
    const plans = new Uint8Array([1, 2, 3, 4]);
    const alt = new Uint8Array([9, 9, 9, 9]);
    const index = buildFileIndex([
      { name: 'plans/a.dwg', logicalId: 'plans', sizeBytes: plans.byteLength, getBytes: async () => plans },
      { name: 'alt/a.dwg', logicalId: 'alt', sizeBytes: alt.byteLength, getBytes: async () => alt },
    ]);
    const deps = await collectXrefClosure({
      hostPath: 'host.dwg',
      hostBytes: new Uint8Array([0]),
      index,
      parentIdentity: true,
      hostLogicalId: 'host',
      xrefChoices: [{ parentLogicalId: 'host', blockName: 'BG', savedPath: 'a.dwg', logicalId: 'alt' }],
      probeParse: async () => ({ report: { xrefs: { BG: 'a.dwg' } } }) as never,
    });
    expect(deps.map((dep) => dep.logicalId)).toEqual(['alt']);
    expect(deps[0]?.bytes).toEqual(alt);
  });

  it('stores the choice by the full triple, including an empty path and a nested parent', () => {
    const host = manualChoiceKey({ parentLogicalId: 'host', blockName: 'TITLE', savedPath: 'a.dwg' });
    const nested = manualChoiceKey({ parentLogicalId: 'child', blockName: 'TITLE', savedPath: 'a.dwg' });
    const empty = manualChoiceKey({ parentLogicalId: 'host', blockName: 'TITLE', savedPath: '' });
    expect(host).not.toBe(nested);
    expect(host).not.toBe(empty);
    expect(empty.endsWith('\u0000')).toBe(true);
  });
});
