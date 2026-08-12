import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { documents } from '@drizzle/schema';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { softDeleteDocument } from '@/modules/documents/application/manage-document';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { findDocumentById } from '@/modules/documents/data/documents.repository';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class ControllableStorage implements StoragePort {
  readonly configured = true;
  failCreateUpload = false;
  readonly removed = new Set<string>();

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${input.fileName}`;
  }

  async createUploadUrl(key: string) {
    if (this.failCreateUpload) throw new Error('signed upload unavailable');
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
      token: 'tok',
      path: key,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async createDownloadUrl(key: string) {
    return {
      url: `https://storage.test/download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async downloadBytes() {
    const bytes = new Uint8Array([1, 2, 3]);
    return { bytes, contentType: 'image/jpeg', size: bytes.length };
  }

  async remove(key: string) {
    this.removed.add(key);
  }
}

describe('failed upload orphan cleanup', () => {
  let database: TestDatabase;
  let storage: ControllableStorage;
  let organizationId: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    storage = new ControllableStorage();
    setStoragePort(storage);
  });

  afterAll(async () => {
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.failCreateUpload = false;
    storage.removed.clear();
    await seedSystem(database);
    const owner = await createTestUser(database, 'docs-orphan@example.com');
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Orphan Docs Org', countryCode: 'IL' }),
    );
    organizationId = created.organization.id;
    ownerId = owner.id;
  });

  it('marks the pending document deleted when signed-upload URL creation fails after insert', async () => {
    storage.failCreateUpload = true;

    await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });

      await expect(
        prepareDocumentUpload(context, {
          ownerType: 'organization',
          ownerId: organizationId,
          fileName: 'broken.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 128,
        }),
      ).rejects.toThrow(/Could not create a signed upload target/);
    });

    const rows = await database.asService(async (db) =>
      db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, organizationId),
            eq(documents.originalFilename, 'broken.jpg'),
          ),
        ),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('deleted');
    expect(rows[0]?.deletedAt).toBeTruthy();
  });

  it('soft-deletes a pending document after a simulated client storage upload failure', async () => {
    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName: 'client-fail.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
      });
    });
    expect(prepared.document.status).toBe('pending');

    await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      await softDeleteDocument(context, { documentId: prepared.document.id });
    });

    const row = await database.asService(async (db) =>
      findDocumentById(db, organizationId, prepared.document.id),
    );

    expect(row?.status).toBe('deleted');
    expect(storage.removed.has(prepared.document.storagePath)).toBe(true);
  });
});
