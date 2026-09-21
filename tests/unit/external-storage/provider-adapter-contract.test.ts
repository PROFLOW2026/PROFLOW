import { describe, expect, it } from 'vitest';
import type { StorageProviderAdapter } from '@/modules/external-storage/domain/provider-interface';
import type { StorageProviderKey } from '@/modules/external-storage/domain/types';
import {
  getStorageProviderAdapter,
  listConfiguredStorageProviders,
} from '@/modules/external-storage/providers/registry';

const ALL_PROVIDERS: StorageProviderKey[] = ['onedrive', 'google_drive', 'dropbox', 'box'];

const REQUIRED_METHODS: Exclude<keyof StorageProviderAdapter, 'provider'>[] = [
  'buildAuthorizationUrl',
  'exchangeAuthorizationCode',
  'refreshAccessToken',
  'getAccountInfo',
  'createFolder',
  'getFolder',
  'listFolder',
  'renameFolder',
  'moveFolder',
  'deleteFolder',
  'uploadFile',
  'replaceFileContent',
  'getFileMetadata',
  'downloadFileStream',
  'renameFile',
  'moveFile',
  'deleteFile',
];

describe('StorageProviderAdapter contract', () => {
  for (const provider of ALL_PROVIDERS) {
    it(`${provider} adapter exposes all required methods`, () => {
      const adapter = getStorageProviderAdapter(provider);
      expect(adapter.provider).toBe(provider);
      for (const method of REQUIRED_METHODS) {
        expect(typeof adapter[method]).toBe('function');
      }
    });
  }

  it('listConfiguredStorageProviders returns subset of known providers', () => {
    const configured = listConfiguredStorageProviders();
    for (const provider of configured) {
      expect(ALL_PROVIDERS).toContain(provider);
    }
  });
});
