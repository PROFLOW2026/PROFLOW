import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { and, eq } from 'drizzle-orm';
import { auditEvents, documents } from '@drizzle/schema';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import {
  retryFailedDocumentCleanups,
  softDeleteDocument,
} from '@/modules/documents/application/manage-document';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { findDocumentById, listDeletedDocumentsNeedingStorageCleanup } from '@/modules/documents/data/documents.repository';
import {
  encodeStorageOrphanChecksum,
  isStorageOrphanChecksum,
  STORAGE_CLEANUP_RETRY_ATTEMPTS,
} from '@/modules/documents/domain/storage-cleanup';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class ControllableStorage implements StoragePort {
  readonly configured = true;
  failCreateUpload = false;
  failRemoveRemaining = 0;
  removeCalls = 0;
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
    this.removeCalls += 1;
    if (this.failRemoveRemaining > 0) {
      this.failRemoveRemaining -= 1;
      throw new Error('storage remove failed');
    }
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
    storage.failRemoveRemaining = 0;
    storage.removeCalls = 0;
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
    expect(isStorageOrphanChecksum(row?.checksum)).toBe(false);
  });

  it('retries storage remove on soft-delete until it succeeds', async () => {
    storage.failRemoveRemaining = 1;

    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName: 'retry-ok.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
      });
    });

    const deleted = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return softDeleteDocument(context, { documentId: prepared.document.id });
    });

    expect(deleted.status).toBe('deleted');
    expect(deleted.deletedAt).toBeTruthy();
    expect(storage.removeCalls).toBe(2);
    expect(storage.removed.has(prepared.document.storagePath)).toBe(true);
    expect(isStorageOrphanChecksum(deleted.checksum)).toBe(false);
    expect(deleted.storageCleanupStatus).toBe('succeeded');
    expect(deleted.storageCleanupError).toBeNull();

    const failureEvents = await database.asService(async (db) =>
      db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, organizationId),
            eq(auditEvents.entityId, prepared.document.id),
            eq(auditEvents.action, AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_FAILED),
          ),
        ),
    );
    expect(failureEvents).toHaveLength(0);
  });

  it('keeps deleted metadata and records an audit event when storage remove keeps failing', async () => {
    storage.failRemoveRemaining = STORAGE_CLEANUP_RETRY_ATTEMPTS + 2;

    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName: 'orphan.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
      });
    });

    const deleted = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return softDeleteDocument(context, { documentId: prepared.document.id });
    });

    expect(deleted.status).toBe('deleted');
    expect(deleted.deletedAt).toBeTruthy();
    expect(isStorageOrphanChecksum(deleted.checksum)).toBe(false);
    expect(deleted.storageCleanupStatus).toBe('failed');
    expect(deleted.storageCleanupError).toBe('storage remove failed');
    expect(deleted.storageCleanupAttempts).toBe(STORAGE_CLEANUP_RETRY_ATTEMPTS);
    expect(storage.removed.has(prepared.document.storagePath)).toBe(false);
    expect(storage.removeCalls).toBe(STORAGE_CLEANUP_RETRY_ATTEMPTS);

    const events = await database.asService(async (db) =>
      db
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, organizationId),
            eq(auditEvents.entityId, prepared.document.id),
          ),
        ),
    );

    const actions = events.map((event) => event.action);
    expect(actions).toContain(AUDIT_ACTIONS.DOCUMENT_DELETED);
    expect(actions).toContain(AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_FAILED);

    const failure = events.find(
      (event) => event.action === AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_FAILED,
    );
    expect(failure?.metadata).toMatchObject({
      storagePath: prepared.document.storagePath,
      attempts: STORAGE_CLEANUP_RETRY_ATTEMPTS,
      error: 'storage remove failed',
    });

    storage.failRemoveRemaining = 0;
    storage.removeCalls = 0;

    const sweep = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return retryFailedDocumentCleanups(context);
    });

    expect(sweep).toEqual({
      attempted: 1,
      succeeded: 1,
      failed: 0,
      succeededIds: [prepared.document.id],
      failedIds: [],
    });
    expect(storage.removed.has(prepared.document.storagePath)).toBe(true);

    const afterSweep = await database.asService(async (db) =>
      findDocumentById(db, organizationId, prepared.document.id),
    );
    expect(afterSweep?.status).toBe('deleted');
    expect(afterSweep?.storageCleanupStatus).toBe('succeeded');
    expect(afterSweep?.storageCleanupError).toBeNull();
    expect(isStorageOrphanChecksum(afterSweep?.checksum)).toBe(false);

    const completed = await database.asService(async (db) =>
      db
        .select({ action: auditEvents.action })
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.organizationId, organizationId),
            eq(auditEvents.entityId, prepared.document.id),
            eq(auditEvents.action, AUDIT_ACTIONS.DOCUMENT_STORAGE_CLEANUP_COMPLETED),
          ),
        ),
    );
    expect(completed).toHaveLength(1);
  });

  it('retries pending and failed deleted rows and restores a leftover checksum prefix', async () => {
    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName: 'pending.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
      });
    });

    await database.asService(async (db) => {
      await db
        .update(documents)
        .set({
          status: 'deleted',
          deletedAt: new Date(),
          checksum: encodeStorageOrphanChecksum('abc123'),
          storageCleanupStatus: 'pending',
          storageCleanupAttempts: 1,
        })
        .where(eq(documents.id, prepared.document.id));
    });

    const listed = await database.asUser(ownerId, async (tx) =>
      listDeletedDocumentsNeedingStorageCleanup(tx, organizationId),
    );
    expect(listed.map((row) => row.id)).toEqual([prepared.document.id]);

    storage.failRemoveRemaining = 0;
    const sweep = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return retryFailedDocumentCleanups(context);
    });

    expect(sweep.succeededIds).toEqual([prepared.document.id]);
    const after = await database.asService(async (db) =>
      findDocumentById(db, organizationId, prepared.document.id),
    );
    expect(after?.status).toBe('deleted');
    expect(after?.checksum).toBe('abc123');
    expect(after?.storageCleanupStatus).toBe('succeeded');
    expect(after?.storageCleanupError).toBeNull();
  });

  it('does not list deleted documents whose cleanup already succeeded', async () => {
    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName: 'cleaned.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 256,
      });
    });

    await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      await softDeleteDocument(context, { documentId: prepared.document.id });
    });

    const listed = await database.asUser(ownerId, async (tx) =>
      listDeletedDocumentsNeedingStorageCleanup(tx, organizationId),
    );
    expect(listed).toEqual([]);
  });
});
