import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { documentExpiryState } from '@/modules/documents/domain/expiry';
import { isDocumentOwnedStoragePath } from '@/modules/documents/domain/version-storage-path';

describe('document expiry state', () => {
  it('treats a past date as expired and a near date as expiring', () => {
    const now = new Date('2026-08-15T12:00:00.000Z');
    expect(documentExpiryState(null, now)).toBe('none');
    expect(documentExpiryState('2026-08-14', now)).toBe('expired');
    expect(documentExpiryState('2026-08-20', now)).toBe('expiring');
    expect(documentExpiryState('2026-12-01', now)).toBe('none');
  });
});

describe('document-owned storage path', () => {
  const orgId = '11111111-1111-4111-8111-111111111111';
  const documentId = '22222222-2222-4222-8222-222222222222';

  it('accepts a tenant-prefixed object key for that document only', () => {
    expect(
      isDocumentOwnedStoragePath(orgId, documentId, `${orgId}/documents/${documentId}/file.pdf`),
    ).toBe(true);
  });

  it('rejects another organization or a path escape', () => {
    expect(
      isDocumentOwnedStoragePath(orgId, documentId, `other-org/documents/${documentId}/file.pdf`),
    ).toBe(false);
    expect(
      isDocumentOwnedStoragePath(orgId, documentId, `${orgId}/documents/${documentId}/../secret.pdf`),
    ).toBe(false);
  });
});

describe('0048 current version integrity', () => {
  it('enforces exactly one current version matching documents.current_version_id', async () => {
    const sql = await readFile(
      path.resolve(process.cwd(), 'drizzle/migrations/0048_document_versioning.sql'),
      'utf8',
    );
    expect(sql).toContain('FOREIGN KEY (current_version_id, id, organization_id)');
    expect(sql).toContain('REFERENCES public.document_versions (id, document_id, organization_id)');
    expect(sql).toContain('document_versions_id_document_org_uq');
    expect(sql).toContain(
      'document_versions: a document with versions must have exactly one current version',
    );
    expect(sql).toContain('current_version_id must be the current version of this document');
    expect(sql).toContain('AFTER INSERT OR UPDATE OF is_current, document_id, organization_id OR DELETE');
    expect(sql).toContain('DEFERRABLE INITIALLY DEFERRED');
  });
});
