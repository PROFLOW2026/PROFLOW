import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createOrganization } from '@/modules/tenancy';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  createDocumentDownloadUrl,
  finalizeDocumentUpload,
} from '@/modules/documents/application/manage-document';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { createVendor } from '@/modules/vendors';
import { NotFoundError } from '@/shared/errors';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class MockStoragePort implements StoragePort {
  readonly configured = true;
  readonly keys = new Set<string>();

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${input.fileName}`;
  }

  async createUploadUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    this.keys.add(key);
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
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

describe('documents tenant isolation', () => {
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

  it('denies download URL for a document in another organization', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const documentId = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });

      const vendor = await createVendor(context, { name: 'Doc Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'invoice.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });

      storage.keys.add(prepared.document.storagePath);

      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: 2048,
      });

      expect(prepared.document.storagePath.startsWith(`${orgA.organizationId}/`)).toBe(true);
      return prepared.document.id;
    });

    await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });

      await expect(createDocumentDownloadUrl(context, { documentId })).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });

  it('issues download URLs only for documents in the active organization', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');

    await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });

      const vendor = await createVendor(context, { name: 'Own Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'receipt.png',
        mimeType: 'image/png',
        sizeBytes: 512,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });

      storage.keys.add(prepared.document.storagePath);

      await finalizeDocumentUpload(context, {
        documentId: prepared.document.id,
        sizeBytes: 512,
      });

      const download = await createDocumentDownloadUrl(context, { documentId: prepared.document.id });
      expect(download.url).toContain(encodeURIComponent(prepared.document.storagePath));
    });
  });
});
