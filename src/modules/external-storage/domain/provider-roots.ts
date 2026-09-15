import type { StorageProviderKey } from './types';

const PROVIDER_ROOT_FOLDER_IDS: Record<StorageProviderKey, string> = {
  onedrive: 'root',
  google_drive: 'root',
  dropbox: '',
  box: '0',
};

export function resolveProviderRootFolderId(provider: StorageProviderKey): string {
  return PROVIDER_ROOT_FOLDER_IDS[provider];
}

export function normalizeProviderFolderId(provider: StorageProviderKey, folderId: string): string {
  if (provider === 'box') {
    return folderId === 'root' ? '0' : folderId;
  }
  if (provider === 'dropbox') {
    if (folderId === 'root' || folderId === '/') return '';
    return folderId;
  }
  return folderId;
}
