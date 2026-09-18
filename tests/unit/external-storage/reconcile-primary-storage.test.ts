import { describe, expect, it, vi } from 'vitest';
import { ensureUsablePrimaryStorageConnection } from '@/modules/external-storage/application/reconcile-primary-storage';
import type { StorageConnectionRecord } from '@/modules/external-storage/domain/types';

function connection(
  patch: Partial<StorageConnectionRecord> & Pick<StorageConnectionRecord, 'id'>,
): StorageConnectionRecord {
  return {
    organizationId: 'org-1',
    provider: 'onedrive',
    status: 'connected',
    isPrimary: false,
    externalAccountId: 'acct',
    externalAccountName: 'Test',
    externalAccountEmail: 'test@example.com',
    externalTenantId: null,
    rootFolderExternalId: 'root-id',
    rootFolderName: 'ProjectFlow',
    scopesJson: [],
    tokenExpiresAt: null,
    connectedByUserId: null,
    connectedAt: null,
    lastValidatedAt: null,
    lastError: null,
    quotaUsedBytes: null,
    quotaTotalBytes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe('ensureUsablePrimaryStorageConnection', () => {
  it('returns usable designated primary without changes', async () => {
    const primary = connection({ id: 'primary', isPrimary: true });
    const db = {} as never;
    const repo = await import('@/modules/external-storage/data/connections.repository');
    vi.spyOn(repo, 'getPrimaryStorageConnection').mockResolvedValue(primary);
    vi.spyOn(repo, 'updateStorageConnection').mockResolvedValue(primary);
    vi.spyOn(repo, 'listStorageConnections').mockResolvedValue([primary]);

    await expect(ensureUsablePrimaryStorageConnection(db, 'org-1')).resolves.toEqual(primary);
  });

  it('reconciles provisioned connecting connections before resolving primary', async () => {
    const connecting = connection({
      id: 'dropbox',
      provider: 'dropbox',
      status: 'connecting',
      isPrimary: true,
    });
    const reconciled = connection({
      id: 'dropbox',
      provider: 'dropbox',
      status: 'connected',
      isPrimary: true,
    });
    const db = {} as never;
    const repo = await import('@/modules/external-storage/data/connections.repository');
    const reconcile = await import('@/modules/external-storage/application/reconcile-connecting-storage');
    vi.spyOn(reconcile, 'reconcileProvisionedConnectingStorageConnections').mockResolvedValue(undefined);
    vi.spyOn(repo, 'getPrimaryStorageConnection').mockResolvedValue(reconciled);
    vi.spyOn(repo, 'listStorageConnections').mockResolvedValue([connecting]);

    await expect(ensureUsablePrimaryStorageConnection(db, 'org-1')).resolves.toEqual(reconciled);
    expect(reconcile.reconcileProvisionedConnectingStorageConnections).toHaveBeenCalledWith(db, 'org-1');
  });

  it('promotes a usable connected provider when primary lacks root folder', async () => {
    const brokenPrimary = connection({ id: 'broken', isPrimary: true, rootFolderExternalId: null });
    const usable = connection({ id: 'usable', isPrimary: false });
    const refreshed = connection({ id: 'usable', isPrimary: true });
    const db = {} as never;
    const repo = await import('@/modules/external-storage/data/connections.repository');
    vi.spyOn(repo, 'getPrimaryStorageConnection').mockResolvedValue(brokenPrimary);
    vi.spyOn(repo, 'updateStorageConnection').mockResolvedValue(refreshed);
    vi.spyOn(repo, 'listStorageConnections').mockResolvedValue([brokenPrimary, usable]);
    vi.spyOn(repo, 'clearPrimaryExcept').mockResolvedValue(undefined);
    vi.spyOn(repo, 'findStorageConnectionById').mockResolvedValue(refreshed);

    await expect(ensureUsablePrimaryStorageConnection(db, 'org-1')).resolves.toEqual(refreshed);
    expect(repo.updateStorageConnection).toHaveBeenCalledWith(db, 'org-1', 'broken', { isPrimary: false });
    expect(repo.clearPrimaryExcept).toHaveBeenCalledWith(db, 'org-1', 'usable');
  });
});
