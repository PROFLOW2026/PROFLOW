import { describe, expect, it } from 'vitest';
import { dedupeProjectRootManagedFolders } from '@/modules/external-storage/domain/project-root-listing';
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
    const out = dedupeProjectRootManagedFolders(
      folders,
      mappings,
      (t) => t === 'quotes' || t === 'contracts',
    );
    expect(out.map((f) => f.id)).toEqual(['canonical-quotes', 'custom']);
  });
});
