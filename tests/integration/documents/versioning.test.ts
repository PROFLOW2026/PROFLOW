import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import {
  createDocumentDownloadUrl,
  finalizeDocumentUpload,
} from '@/modules/documents/application/manage-document';
import {
  createDocumentVersionDownloadUrl,
  listVersions,
  prepareNewVersionUpload,
  uploadNewVersion,
} from '@/modules/documents/application/manage-versions';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { createVendor } from '@/modules/vendors';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class MockStoragePort implements StoragePort {
  readonly configured = true;
  readonly keys = new Set<string>();
  private sequence = 0;

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    this.sequence += 1;
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${this.sequence}-${input.fileName}`;
  }

  async createUploadUrl(key: string): Promise<{
    url: string;
    token: string | null;
    path: string;
    expiresAt: Date;
  }> {
    this.keys.add(key);
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
      token: 'test-upload-token',
      path: key,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async createDownloadUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    if (!this.keys.has(key)) throw new Error('missing object');
    return {
      url: `https://storage.test/download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async downloadBytes(key: string): Promise<{ bytes: Uint8Array; contentType: string; size: number }> {
    if (!this.keys.has(key)) throw new Error('missing object');
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, this.sequence]);
    return { bytes, contentType: 'application/pdf', size: bytes.length };
  }

  async remove(key: string): Promise<void> {
    this.keys.delete(key);
  }
}

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
}

function contextWithoutDocumentsRead(base: OrgContext): OrgContext {
  const permissions = new Set(base.permissions);
  permissions.delete(PERMISSIONS.DOCUMENTS_READ);
  permissions.delete(PERMISSIONS.DOCUMENTS_MANAGE);
  return { ...base, permissions };
}

describe('document versioning', () => {
  let database: TestDatabase;
  let storage: MockStoragePort;

  beforeAll(async () => {
    database = await createTestDatabase();
    storage = new MockStoragePort();
    setStoragePort(storage);
  });

  afterAll(async () => {
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.keys.clear();
  });

  it('creates version 1 on first upload and keeps it when a newer version is uploaded', async () => {
    const org = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');

    await database.asUser(org.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: org.owner.id,
        organizationId: org.organizationId,
        locale: 'en',
      });

      const vendor = await createVendor(context, { name: 'Doc Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'contract.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });

      storage.keys.add(prepared.document.storagePath);
      const first = await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: 2048,
      });

      expect(first.currentVersionId).toBeTruthy();
      const afterFirst = await listVersions(context, { documentId: first.id });
      expect(afterFirst).toHaveLength(1);
      expect(afterFirst[0]?.versionNumber).toBe(1);
      expect(afterFirst[0]?.isCurrent).toBe(true);
      expect(afterFirst[0]?.storagePath).toBe(first.storagePath);
      const version1Path = afterFirst[0]!.storagePath;
      const version1Id = afterFirst[0]!.id;

      const next = await prepareNewVersionUpload(context, {
        documentId: first.id,
        fileName: 'contract-signed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      });
      storage.keys.add(next.uploadPath);

      const uploaded = await uploadNewVersion(context, {
        documentId: first.id,
        storagePath: next.uploadPath,
        originalFilename: 'contract-signed.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
      });

      expect(uploaded.version.versionNumber).toBe(2);
      expect(uploaded.version.isCurrent).toBe(true);
      expect(uploaded.document.currentVersionId).toBe(uploaded.version.id);
      expect(uploaded.document.storagePath).toBe(next.uploadPath);
      expect(uploaded.document.originalFilename).toBe('contract-signed.pdf');

      const versions = await listVersions(context, { documentId: first.id });
      expect(versions).toHaveLength(2);
      expect(versions.filter((version) => version.isCurrent)).toHaveLength(1);
      expect(versions.find((version) => version.versionNumber === 1)?.id).toBe(version1Id);
      expect(versions.find((version) => version.versionNumber === 1)?.storagePath).toBe(version1Path);
      expect(versions.find((version) => version.versionNumber === 1)?.isCurrent).toBe(false);
      expect(storage.keys.has(version1Path)).toBe(true);
      expect(storage.keys.has(next.uploadPath)).toBe(true);

      const currentDownload = await createDocumentDownloadUrl(context, { documentId: first.id });
      expect(currentDownload.url).toContain(encodeURIComponent(next.uploadPath));

      const oldDownload = await createDocumentVersionDownloadUrl(context, { versionId: version1Id });
      expect(oldDownload.url).toContain(encodeURIComponent(version1Path));
    });
  });

  it('does not let another organization read versions or download files', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const ids = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Alpha Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'secret.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });
      storage.keys.add(prepared.document.storagePath);
      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: 1024,
      });
      const versions = await listVersions(context, { documentId: prepared.document.id });
      return { documentId: prepared.document.id, versionId: versions[0]!.id };
    });

    await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });

      await expect(listVersions(context, { documentId: ids.documentId })).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(
        createDocumentDownloadUrl(context, { documentId: ids.documentId }),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        createDocumentVersionDownloadUrl(context, { versionId: ids.versionId }),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('refuses version reads without documents.read', async () => {
    const org = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');

    await database.asUser(org.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: org.owner.id,
        organizationId: org.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Perm Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'permit.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });
      storage.keys.add(prepared.document.storagePath);
      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: 512,
      });

      const denied = contextWithoutDocumentsRead(context);
      await expect(listVersions(denied, { documentId: prepared.document.id })).rejects.toBeInstanceOf(
        AuthorizationError,
      );
      await expect(
        createDocumentDownloadUrl(denied, { documentId: prepared.document.id }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
