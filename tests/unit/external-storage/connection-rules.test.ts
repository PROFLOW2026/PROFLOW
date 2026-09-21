import { describe, expect, it } from 'vitest';
import {
  isUsableStorageConnection,
  shouldPromoteConnectedStorageToPrimary,
} from '@/modules/external-storage/domain/connection-rules';
import type { StorageConnectionRecord } from '@/modules/external-storage/domain/types';

function connection(
  patch: Partial<StorageConnectionRecord> = {},
): StorageConnectionRecord {
  return {
    id: 'conn-1',
    organizationId: 'org-1',
    provider: 'onedrive',
    status: 'connected',
    isPrimary: true,
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
    capabilitiesJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe('isUsableStorageConnection', () => {
  it('requires connected status and root folder', () => {
    expect(isUsableStorageConnection(connection())).toBe(true);
    expect(isUsableStorageConnection(connection({ rootFolderExternalId: null }))).toBe(false);
    expect(isUsableStorageConnection(connection({ status: 'disconnected' }))).toBe(false);
    expect(isUsableStorageConnection(null)).toBe(false);
  });
});

describe('shouldPromoteConnectedStorageToPrimary', () => {
  it('promotes when no primary exists', () => {
    expect(shouldPromoteConnectedStorageToPrimary(null)).toBe(true);
  });

  it('promotes when primary is connected but missing root folder', () => {
    expect(
      shouldPromoteConnectedStorageToPrimary(
        connection({ rootFolderExternalId: null, isPrimary: true }),
      ),
    ).toBe(true);
  });

  it('does not promote when a usable primary already exists', () => {
    expect(shouldPromoteConnectedStorageToPrimary(connection())).toBe(false);
  });
});
