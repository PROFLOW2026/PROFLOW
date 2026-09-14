import { describe, expect, it } from 'vitest';
import { sanitizeProviderFolderName } from '@/modules/external-storage/domain/folder-names';

describe('sanitizeProviderFolderName', () => {
  it('replaces OneDrive-forbidden characters', () => {
    expect(sanitizeProviderFolderName('טל ניר בע"מ')).toBe('טל ניר בע-מ');
    expect(sanitizeProviderFolderName('a/b:c*d?')).toBe('a-b-c-d-');
  });

  it('falls back when empty after sanitization', () => {
    expect(sanitizeProviderFolderName('   ')).toBe('Folder');
  });
});
