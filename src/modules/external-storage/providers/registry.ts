import 'server-only';

import type { StorageProviderAdapter } from '../domain/provider-interface';
import type { StorageProviderKey } from '../domain/types';
import { boxProvider } from './box';
import { dropboxProvider } from './dropbox';
import { googleDriveProvider } from './google-drive';
import { oneDriveProvider } from './onedrive';

const providers: Record<StorageProviderKey, StorageProviderAdapter> = {
  onedrive: oneDriveProvider,
  google_drive: googleDriveProvider,
  dropbox: dropboxProvider,
  box: boxProvider,
};

export function getStorageProviderAdapter(provider: StorageProviderKey): StorageProviderAdapter {
  const adapter = providers[provider];
  if (!adapter) throw new Error(`Unknown storage provider: ${provider}`);
  return adapter;
}

export function isStorageProviderConfigured(provider: StorageProviderKey): boolean {
  switch (provider) {
    case 'onedrive':
      return Boolean(
        process.env.MICROSOFT_STORAGE_CLIENT_ID?.trim() &&
          process.env.MICROSOFT_STORAGE_CLIENT_SECRET?.trim(),
      );
    case 'google_drive':
      return Boolean(
        process.env.GOOGLE_STORAGE_CLIENT_ID?.trim() &&
          process.env.GOOGLE_STORAGE_CLIENT_SECRET?.trim(),
      );
    case 'dropbox':
      return Boolean(
        process.env.DROPBOX_STORAGE_CLIENT_ID?.trim() &&
          process.env.DROPBOX_STORAGE_CLIENT_SECRET?.trim(),
      );
    case 'box':
      return Boolean(
        process.env.BOX_STORAGE_CLIENT_ID?.trim() &&
          process.env.BOX_STORAGE_CLIENT_SECRET?.trim(),
      );
    default:
      return false;
  }
}

export function listConfiguredStorageProviders(): StorageProviderKey[] {
  return (Object.keys(providers) as StorageProviderKey[]).filter(isStorageProviderConfigured);
}
