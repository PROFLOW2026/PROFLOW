import type { StorageProviderKey } from './types';

export interface StorageProviderCapabilities {
  readonly supportsRangeDownload: boolean;
  readonly supportsProviderWebUrl: boolean;
  readonly supportsRefreshToken: boolean;
  readonly supportsMoveFolder: boolean;
  readonly supportsResumableUpload: boolean;
  readonly isGoogleNativeDoc: (mimeType: string) => boolean;
}

const GOOGLE_NATIVE_DOC_PREFIX = 'application/vnd.google-apps.';
const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

function isGoogleNativeDocumentMime(mimeType: string): boolean {
  const normalized = mimeType.trim().toLowerCase();
  if (!normalized.startsWith(GOOGLE_NATIVE_DOC_PREFIX)) return false;
  return normalized !== GOOGLE_FOLDER_MIME;
}

const CAPABILITIES: Record<StorageProviderKey, StorageProviderCapabilities> = {
  onedrive: {
    supportsRangeDownload: true,
    supportsProviderWebUrl: true,
    supportsRefreshToken: true,
    supportsMoveFolder: true,
    supportsResumableUpload: true,
    isGoogleNativeDoc: () => false,
  },
  google_drive: {
    supportsRangeDownload: false,
    supportsProviderWebUrl: true,
    supportsRefreshToken: true,
    supportsMoveFolder: true,
    supportsResumableUpload: false,
    isGoogleNativeDoc: isGoogleNativeDocumentMime,
  },
  dropbox: {
    supportsRangeDownload: false,
    supportsProviderWebUrl: false,
    supportsRefreshToken: true,
    supportsMoveFolder: true,
    supportsResumableUpload: false,
    isGoogleNativeDoc: () => false,
  },
  box: {
    supportsRangeDownload: true,
    supportsProviderWebUrl: true,
    supportsRefreshToken: true,
    supportsMoveFolder: true,
    supportsResumableUpload: false,
    isGoogleNativeDoc: () => false,
  },
};

export function getStorageProviderCapabilities(
  provider: StorageProviderKey,
): StorageProviderCapabilities {
  return CAPABILITIES[provider];
}
