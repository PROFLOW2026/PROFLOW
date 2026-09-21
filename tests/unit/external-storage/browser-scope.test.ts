import { describe, expect, it, vi } from 'vitest';
import {
  assertFolderWithinProjectTree,
  isFolderDescendantOf,
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
    replaceFileContent: vi.fn(),
    deleteFile: vi.fn(),
  } as StorageProviderAdapter;
}

describe('assertFolderWithinProjectTree', () => {
  it('uses isFolderUnderRoots when available instead of parent walk', async () => {
    const isFolderUnderRoots = vi.fn(async () => true);
    const getFolder = vi.fn();
    const adapter = {
      provider: 'dropbox',
      isFolderUnderRoots,
      getFolder,
    } as unknown as StorageProviderAdapter;

    await assertFolderWithinProjectTree(adapter, 'token', 'nested', new Set(['org-root']));
    expect(isFolderUnderRoots).toHaveBeenCalledOnce();
    expect(getFolder).not.toHaveBeenCalled();
  });

  it('allows semantic project root folders', async () => {
    const roots = new Set(['photos-root']);
    const adapter = mockAdapter({});
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'photos-root', roots),
    ).resolves.toBeUndefined();
  });

  it('allows nested folders under a project root', async () => {
    const roots = new Set(['photos-root']);
    const adapter = mockAdapter({
      'sub-a': { id: 'sub-a', name: 'A', parentId: 'photos-root' },
      'sub-b': { id: 'sub-b', name: 'B', parentId: 'sub-a' },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'sub-b', roots),
    ).resolves.toBeUndefined();
  });

  it('rejects folders outside the project tree', async () => {
    const roots = new Set(['photos-root']);
    const adapter = mockAdapter({
      foreign: { id: 'foreign', name: 'Other', parentId: 'outside-root' },
      'outside-root': { id: 'outside-root', name: 'Outside', parentId: null },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'foreign', roots),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});

describe('isFolderDescendantOf', () => {
  it('treats identical ids as descendant', async () => {
    const adapter = mockAdapter({});
    await expect(isFolderDescendantOf(adapter, 'token', 'folder-a', 'folder-a')).resolves.toBe(true);
  });

  it('detects nested descendants', async () => {
    const adapter = mockAdapter({
      'folder-a': { id: 'folder-a', name: 'A', parentId: 'root' },
      'folder-b': { id: 'folder-b', name: 'B', parentId: 'folder-a' },
      'folder-c': { id: 'folder-c', name: 'C', parentId: 'folder-b' },
      root: { id: 'root', name: 'Root', parentId: null },
    });
    await expect(isFolderDescendantOf(adapter, 'token', 'folder-c', 'folder-a')).resolves.toBe(
      true,
    );
  });

  it('returns false for siblings and parents', async () => {
    const adapter = mockAdapter({
      root: { id: 'root', name: 'Root', parentId: null },
      'folder-a': { id: 'folder-a', name: 'A', parentId: 'root' },
      'folder-b': { id: 'folder-b', name: 'B', parentId: 'root' },
    });
    await expect(isFolderDescendantOf(adapter, 'token', 'folder-b', 'folder-a')).resolves.toBe(
      false,
    );
    await expect(isFolderDescendantOf(adapter, 'token', 'root', 'folder-a')).resolves.toBe(false);
  });
});
