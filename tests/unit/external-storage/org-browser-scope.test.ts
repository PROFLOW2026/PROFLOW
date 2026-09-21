import { describe, expect, it, vi } from 'vitest';
import { assertFolderWithinProjectTree } from '@/modules/external-storage/application/browser-scope';
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

describe('organization_root security boundary', () => {
  const orgRootId = 'org-root';
  const boundary = new Set([orgRootId]);

  it('allows organization_root itself', async () => {
    const adapter = mockAdapter({});
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', orgRootId, boundary),
    ).resolves.toBeUndefined();
  });

  it('allows arbitrary folders under ProjectFlow such as ניסיון', async () => {
    const adapter = mockAdapter({
      trial: { id: 'trial', name: 'ניסיון', parentId: orgRootId },
      nested: { id: 'nested', name: 'תיקייה א', parentId: 'trial' },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'nested', boundary),
    ).resolves.toBeUndefined();
  });

  it('blocks folders outside ProjectFlow', async () => {
    const adapter = mockAdapter({
      personal: { id: 'personal', name: 'Attachments', parentId: 'drive-root' },
      'drive-root': { id: 'drive-root', name: 'Drive', parentId: null },
    });
    await expect(
      assertFolderWithinProjectTree(adapter, 'token', 'personal', boundary),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
