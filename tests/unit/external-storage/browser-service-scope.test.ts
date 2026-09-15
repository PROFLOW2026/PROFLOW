import { describe, expect, it, vi } from 'vitest';
import {
  assertFolderWithinProjectTree,
} from '@/modules/external-storage/application/browser-scope';
import type { StorageProviderAdapter } from '@/modules/external-storage/domain/provider-interface';
import { DomainRuleError } from '@/shared/errors';

function mockAdapter(
  folders: Record<string, { id: string; name: string; parentId: string | null }>,
): StorageProviderAdapter {
  return {
    provider: 'onedrive',
    buildAuthorizationUrl: () => '',
    exchangeAuthorizationCode: vi.fn(),
    refreshAccessToken: vi.fn(),
    getAccountInfo: vi.fn(),
    createFolder: vi.fn(),
    getFolder: vi.fn(async (_token, folderId) => folders[folderId] ?? null),
    listFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    uploadFile: vi.fn(),
    getFileMetadata: vi.fn(),
    downloadFileStream: vi.fn(),
    renameFile: vi.fn(),
    moveFile: vi.fn(),
    deleteFile: vi.fn(),
  } as StorageProviderAdapter;
}

describe('project_root security boundary', () => {
  const projectRootId = 'project-root';
  const boundary = new Set([projectRootId]);

  it('allows project_root itself', async () => {
    const adapter = mockAdapter({});
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', projectRootId, boundary),
    ).resolves.toBeUndefined();
  });

  it('allows arbitrary nested folders under project_root', async () => {
    const adapter = mockAdapter({
      'user-a': { id: 'user-a', name: 'A', parentId: projectRootId },
      'user-b': { id: 'user-b', name: 'B', parentId: 'user-a' },
      'user-c': { id: 'user-c', name: 'C', parentId: 'user-b' },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'user-c', boundary),
    ).resolves.toBeUndefined();
  });

  it('allows semantic folders that are direct children of project_root', async () => {
    const adapter = mockAdapter({
      'photos-root': { id: 'photos-root', name: 'Photos', parentId: projectRootId },
      'nested': { id: 'nested', name: 'Nested', parentId: 'photos-root' },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'nested', boundary),
    ).resolves.toBeUndefined();
  });

  it('rejects folders outside project_root tree', async () => {
    const adapter = mockAdapter({
      foreign: { id: 'foreign', name: 'Foreign', parentId: 'other-project-root' },
      'other-project-root': { id: 'other-project-root', name: 'Other', parentId: null },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'foreign', boundary),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('rejects sibling project roots even if semantic folder ids were leaked', async () => {
    const adapter = mockAdapter({
      'other-photos': { id: 'other-photos', name: 'Photos', parentId: 'other-project-root' },
      'other-project-root': { id: 'other-project-root', name: 'Other project', parentId: null },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'other-photos', boundary),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
