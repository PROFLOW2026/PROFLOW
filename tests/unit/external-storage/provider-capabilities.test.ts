import { describe, expect, it } from 'vitest';
import { getStorageProviderCapabilities } from '@/modules/external-storage/domain/provider-capabilities';
import type { StorageProviderKey } from '@/modules/external-storage/domain/types';

const PROVIDERS: StorageProviderKey[] = ['onedrive', 'google_drive', 'dropbox', 'box'];

describe('getStorageProviderCapabilities', () => {
  it('returns capability flags for every supported provider', () => {
    for (const provider of PROVIDERS) {
      const caps = getStorageProviderCapabilities(provider);
      expect(caps.supportsRefreshToken).toBe(true);
      expect(caps.supportsMoveFolder).toBe(true);
      expect(typeof caps.isGoogleNativeDoc).toBe('function');
    }
  });

  it('marks range download support per provider', () => {
    for (const provider of PROVIDERS) {
      expect(getStorageProviderCapabilities(provider).supportsRangeDownload).toBe(true);
    }
  });

  it('marks provider web URL support per provider', () => {
    for (const provider of PROVIDERS) {
      expect(getStorageProviderCapabilities(provider).supportsProviderWebUrl).toBe(true);
    }
  });

  it('marks resumable upload support for OneDrive only', () => {
    expect(getStorageProviderCapabilities('onedrive').supportsResumableUpload).toBe(true);
    expect(getStorageProviderCapabilities('google_drive').supportsResumableUpload).toBe(false);
    expect(getStorageProviderCapabilities('dropbox').supportsResumableUpload).toBe(false);
    expect(getStorageProviderCapabilities('box').supportsResumableUpload).toBe(false);
  });

  it('detects Google native document mime types on Google Drive only', () => {
    const google = getStorageProviderCapabilities('google_drive');
    expect(google.isGoogleNativeDoc('application/vnd.google-apps.document')).toBe(true);
    expect(google.isGoogleNativeDoc('application/vnd.google-apps.spreadsheet')).toBe(true);
    expect(google.isGoogleNativeDoc('application/vnd.google-apps.folder')).toBe(false);
    expect(google.isGoogleNativeDoc('application/pdf')).toBe(false);

    for (const provider of ['onedrive', 'dropbox', 'box'] as const) {
      expect(
        getStorageProviderCapabilities(provider).isGoogleNativeDoc(
          'application/vnd.google-apps.document',
        ),
      ).toBe(false);
    }
  });
});
