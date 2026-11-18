import { describe, expect, it } from 'vitest';
import {
  isLocalAbsoluteCadPath,
  resolveXrefInFolder,
  type XrefWalkListing,
} from '@/modules/external-storage/domain/xref-folder-walk';

function tree(nodes: Record<string, XrefWalkListing>) {
  return {
    listFolder: async (id: string) => nodes[id] ?? { files: [], folders: [] },
    parentOf: async (id: string) => {
      if (id === 'root') return null;
      if (id === 'plans') return 'root';
      if (id === 'dated') return 'plans';
      if (id === 'inner') return 'dated';
      return null;
    },
  };
}

const nodes: Record<string, XrefWalkListing> = {
  root: { files: [], folders: [{ id: 'plans', name: 'תוכניות', kind: 'folder' }] },
  plans: {
    files: [{ id: 'host', name: '3643-EL.dwg', kind: 'file', sizeBytes: 10 }],
    folders: [{ id: 'dated', name: '02.06.26', kind: 'folder' }],
  },
  dated: {
    files: [{ id: 'xref', name: 'vtk-100.dwg', kind: 'file', sizeBytes: 20 }],
    folders: [{ id: 'inner', name: 'more', kind: 'folder' }],
  },
  inner: {
    files: [{ id: 'nested', name: 'detail.dwg', kind: 'file', sizeBytes: 5 }],
    folders: [],
  },
};

describe('xref folder walk', () => {
  it('rejects a local absolute path', () => {
    expect(isLocalAbsoluteCadPath('C:\\drawings\\a.dwg')).toBe(true);
    expect(isLocalAbsoluteCadPath('.\\02.06.26\\vtk-100.dwg')).toBe(false);
  });

  it('walks a Hebrew-safe relative subfolder', async () => {
    const walk = tree(nodes);
    const found = await resolveXrefInFolder({
      startFolderId: 'plans',
      rootFolderId: 'root',
      xrefPath: '.\\02.06.26\\vtk-100.dwg',
      listFolder: walk.listFolder,
      parentOf: walk.parentOf,
    });
    expect(found.status).toBe('found');
    if (found.status === 'found') expect(found.file.id).toBe('xref');
  });

  it('stops when .. would leave the connection root', async () => {
    const walk = tree(nodes);
    const found = await resolveXrefInFolder({
      startFolderId: 'plans',
      rootFolderId: 'root',
      xrefPath: '..\\..\\secret.dwg',
      listFolder: walk.listFolder,
      parentOf: walk.parentOf,
    });
    expect(found).toEqual({ status: 'missing', reason: 'escape' });
  });

  it('does not pick another file with the same name outside the saved path', async () => {
    const walk = tree({
      ...nodes,
      plans: {
        files: [{ id: 'decoy', name: 'vtk-100.dwg', kind: 'file', sizeBytes: 1 }],
        folders: [{ id: 'dated', name: '02.06.26', kind: 'folder' }],
      },
    });
    const found = await resolveXrefInFolder({
      startFolderId: 'plans',
      rootFolderId: 'root',
      xrefPath: '.\\02.06.26\\missing.dwg',
      listFolder: walk.listFolder,
      parentOf: walk.parentOf,
    });
    expect(found.status).toBe('missing');
  });

  it('refuses a file over 250MB', async () => {
    const walk = tree({
      ...nodes,
      plans: {
        files: [{ id: 'huge', name: 'big.dwg', kind: 'file', sizeBytes: 251 * 1024 * 1024 }],
        folders: [],
      },
    });
    const found = await resolveXrefInFolder({
      startFolderId: 'plans',
      rootFolderId: 'root',
      xrefPath: 'big.dwg',
      listFolder: walk.listFolder,
      parentOf: walk.parentOf,
    });
    expect(found).toEqual({ status: 'missing', reason: 'too_large' });
  });
});
