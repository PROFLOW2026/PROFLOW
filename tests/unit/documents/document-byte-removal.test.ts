import { describe, expect, it } from 'vitest';
import {
  isMissingProviderObject,
  planDocumentByteRemoval,
} from '@/modules/documents/domain/document-byte-removal';

describe('document byte removal plan', () => {
  it('does not send an external provider file id to Supabase', () => {
    const plan = planDocumentByteRemoval({
      storageBackend: 'external',
      externalConnectionId: 'conn-1',
      externalFileId: 'provider-file-1',
      storagePath: 'provider-file-1',
      extraExternalFileIds: ['provider-file-1', 'provider-file-2'],
    });
    expect(plan).toEqual({
      kind: 'external',
      connectionId: 'conn-1',
      fileIds: ['provider-file-1', 'provider-file-2'],
    });
  });

  it('skips provider delete when an external upload never received a file id', () => {
    const plan = planDocumentByteRemoval({
      storageBackend: 'external',
      externalConnectionId: 'conn-1',
      externalFileId: null,
      storagePath: 'pending://doc-1',
    });
    expect(plan).toEqual({ kind: 'none' });
  });

  it('keeps supabase_legacy rows on the Supabase storage path', () => {
    const plan = planDocumentByteRemoval({
      storageBackend: 'supabase_legacy',
      externalConnectionId: null,
      externalFileId: null,
      storagePath: 'org/entity/file.pdf',
    });
    expect(plan).toEqual({ kind: 'supabase_legacy', storagePath: 'org/entity/file.pdf' });
  });

  it('treats provider 404 as an already-removed object', () => {
    expect(isMissingProviderObject(404)).toBe(true);
    expect(isMissingProviderObject(403)).toBe(false);
    expect(isMissingProviderObject(null)).toBe(false);
  });
});
