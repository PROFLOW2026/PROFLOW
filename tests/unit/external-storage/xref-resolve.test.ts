import { describe, expect, it } from 'vitest';
import { resolveXrefTwoPhase, xrefFileNamesMatch } from '@/modules/external-storage/domain/xref-resolve';
import type { XrefWalkListing } from '@/modules/external-storage/domain/xref-folder-walk';

describe('xref two-phase resolve', () => {
  const nodes: Record<string, XrefWalkListing> = {
    host: {
      files: [{ id: 'main', name: 'host.dwg', kind: 'file', sizeBytes: 1 }],
      folders: [{ id: 'sub', name: 'refs', kind: 'folder' }],
    },
    sub: {
      files: [
        { id: 'a', name: 'bg-layout.dwg', kind: 'file', sizeBytes: 2 },
        { id: 'b', name: 'bg-layout', kind: 'file', sizeBytes: 3 },
      ],
      folders: [],
    },
  };

  const walk = {
    listFolder: async (id: string) => nodes[id] ?? { files: [], folders: [] },
    parentOf: async (id: string) => (id === 'host' ? 'root' : id === 'sub' ? 'host' : null),
  };

  it('matches names with and without .dwg extension', () => {
    expect(xrefFileNamesMatch('bg-layout', 'bg-layout.dwg')).toBe(true);
  });

  it('finds by saved subfolder path', async () => {
    const found = await resolveXrefTwoPhase({
      xrefName: 'bg-layout',
      savedPath: '.\\refs\\bg-layout.dwg',
      startFolderId: 'host',
      rootFolderId: 'root',
      ...walk,
    });
    expect(found.status).toBe('found');
    if (found.status === 'found') expect(found.file.id).toBe('a');
  });

  it('finds by name search when saved path is empty', async () => {
    const found = await resolveXrefTwoPhase({
      xrefName: 'bg-layout',
      savedPath: '',
      startFolderId: 'host',
      rootFolderId: 'root',
      ...walk,
    });
    expect(found.status).toBe('ambiguous');
  });

  it('hides gated files before counting', async () => {
    const found = await resolveXrefTwoPhase({
      xrefName: 'bg-layout',
      savedPath: '',
      startFolderId: 'host',
      rootFolderId: 'root',
      ...walk,
      gate: (file) => (file.id === 'b' ? 'allow' : 'hidden'),
    });
    expect(found.status).toBe('found');
    if (found.status === 'found') expect(found.file.id).toBe('b');
  });
});