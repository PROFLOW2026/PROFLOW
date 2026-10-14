import { describe, expect, it } from 'vitest';
import {
  dedupeProjectRootManagedFolders,
  dedupeProjectRootManagedFoldersPreservingContent,
} from '@/modules/external-storage/domain/project-root-listing';
import type { FolderMappingRecord } from '@/modules/external-storage/domain/types';

const baseMapping = (patch: Partial<FolderMappingRecord>): FolderMappingRecord => ({
  id: 'm1',
  organizationId: 'org',
  connectionId: 'conn',
  semanticFolderType: 'quotes',
  entityType: 'project',
  entityId: 'proj',
  externalFolderId: 'canonical-quotes',
  externalParentId: 'root',
  displayName: '01 - הצעות מחיר',
  status: 'ready',
  lastError: null,
  ...patch,
});

describe('dedupeProjectRootManagedFolders', () => {
  it('keeps only the mapped folder id for managed names', () => {
    const folders = [
      { id: 'dup-1', name: '01 - הצעות מחיר', parentId: 'root', webUrl: null },
      { id: 'canonical-quotes', name: '01 - הצעות מחיר', parentId: 'root', webUrl: null },
      { id: 'dup-2', name: '01 - הצעות מחיר', parentId: 'root', webUrl: null },
      { id: 'custom', name: 'Archive', parentId: 'root', webUrl: null },
    ];
    const mappings = [baseMapping({})];
    const out = dedupeProjectRootManagedFolders(folders, mappings);
    expect(out.map((f) => f.id)).toEqual(['canonical-quotes', 'custom']);
  });
});

describe('dedupeProjectRootManagedFoldersPreservingContent', () => {
  it('keeps non-canonical managed folder when it has files', async () => {
    const folders = [
      { id: 'dup-1', name: '01 - הצעות מחיר', parentId: 'root', webUrl: null },
      { id: 'canonical-quotes', name: '01 - הצעות מחיר', parentId: 'root', webUrl: null },
    ];
    const mappings = [baseMapping({})];
    const out = await dedupeProjectRootManagedFoldersPreservingContent(
      folders,
      mappings,
      async (folderId) =>
        folderId === 'dup-1'
          ? { folders: [], files: [{ id: 'f1', name: 'a.pdf', parentId: 'dup-1', webUrl: null, mimeType: null, sizeBytes: 1, modifiedAt: null, etag: null }] }
          : { folders: [], files: [] },
    );
    expect(out.map((f) => f.id).sort()).toEqual(['canonical-quotes', 'dup-1']);
  });
});
