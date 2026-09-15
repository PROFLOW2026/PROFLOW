import { describe, expect, it } from 'vitest';
import {
  normalizeProviderFolderId,
  resolveProviderRootFolderId,
} from '@/modules/external-storage/domain/provider-roots';

describe('resolveProviderRootFolderId', () => {
  it('returns provider-specific root folder ids', () => {
    expect(resolveProviderRootFolderId('onedrive')).toBe('root');
    expect(resolveProviderRootFolderId('google_drive')).toBe('root');
    expect(resolveProviderRootFolderId('dropbox')).toBe('');
    expect(resolveProviderRootFolderId('box')).toBe('0');
  });
});

describe('normalizeProviderFolderId', () => {
  it('maps generic root aliases for Box', () => {
    expect(normalizeProviderFolderId('box', 'root')).toBe('0');
    expect(normalizeProviderFolderId('box', 'abc123')).toBe('abc123');
  });

  it('maps generic root aliases for Dropbox', () => {
    expect(normalizeProviderFolderId('dropbox', 'root')).toBe('');
    expect(normalizeProviderFolderId('dropbox', '/')).toBe('');
    expect(normalizeProviderFolderId('dropbox', 'id:abc')).toBe('id:abc');
  });

  it('passes through folder ids for OneDrive and Google Drive', () => {
    expect(normalizeProviderFolderId('onedrive', 'root')).toBe('root');
    expect(normalizeProviderFolderId('google_drive', 'folder-id')).toBe('folder-id');
  });
});
