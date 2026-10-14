import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { documents } from '@drizzle/schema';
import type * as DbClient from '@/shared/db/client';
import type { Transaction } from '@/shared/db/types';
import type { TestDatabase } from '../../setup/database';

vi.mock('server-only', () => ({}));

const { testDbHolder } = vi.hoisted(() => ({
  testDbHolder: { db: null as TestDatabase | null },
}));

vi.mock('@/shared/db/client', async (importOriginal) => {
  const actual = await importOriginal<typeof DbClient>();
  return {
    ...actual,
    getAdminDb: () => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.adminDb;
    },
    withUserContext: <T>(userId: string, fn: (tx: Transaction) => Promise<T>) => {
      if (!testDbHolder.db) throw new Error('test database not initialized');
      return testDbHolder.db.asUser(userId, fn);
    },
  };
});

import { runDocumentCleanupOpsWorker } from '@/modules/documents/application/document-cleanup-ops-worker';
import { planFailedDocumentCleanups } from '@/modules/documents/application/manage-document';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase } from '../../setup/database';
import { seedOrganizationStorageConnection } from '../../setup/external-storage-fixture';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class NoOpStorage implements StoragePort {
  readonly configured = true;
  removeCalls = 0;

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${input.fileName}`;
  }

  async createUploadUrl(key: string) {
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
    const bytes = new Uint8Array([1]);
    return { bytes, contentType: 'image/jpeg', size: bytes.length };
  }

  async remove() {
    this.removeCalls += 1;
  }
}

describe('document cleanup ops worker (integration)', () => {
  let database: TestDatabase;
  let storage: NoOpStorage;
  let organizationId: string;
  let ownerId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    testDbHolder.db = database;
    storage = new NoOpStorage();
    setStoragePort(storage);
  });

  afterAll(async () => {
    testDbHolder.db = null;
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.removeCalls = 0;
    await seedSystem(database);
    const owner = await createTestUser(database, 'cleanup-ops@example.com');
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Cleanup Ops Org', countryCode: 'IL' }),
    );
    organizationId = created.organization.id;
    ownerId = owner.id;
    await database.asService(async (db) => {
      await seedOrganizationStorageConnection(db, organizationId, ownerId);
    });
  });

  async function seedDeletedDocument(
    fileName: string,
    cleanup: { status: 'failed' | 'pending' | 'succeeded'; attempts?: number },
  ): Promise<string> {
    const prepared = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return prepareDocumentUpload(context, {
        ownerType: 'organization',
        ownerId: organizationId,
        fileName,
        mimeType: 'image/jpeg',
        sizeBytes: 128,
      });
    });

    await database.asService(async (db) => {
      await db
        .update(documents)
        .set({
          status: 'deleted',
          deletedAt: new Date(),
          storageCleanupStatus: cleanup.status,
          storageCleanupAttempts: cleanup.attempts ?? 1,
          storageCleanupError: cleanup.status === 'failed' ? 'storage remove failed' : null,
        })
        .where(eq(documents.id, prepared.document.id));
    });

    return prepared.document.id;
  }

  it('planFailedDocumentCleanups lists failed and pending deleted rows only', async () => {
    const failedId = await seedDeletedDocument('failed.jpg', { status: 'failed' });
    const pendingId = await seedDeletedDocument('pending.jpg', { status: 'pending' });
    await seedDeletedDocument('done.jpg', { status: 'succeeded' });

    const rows = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return planFailedDocumentCleanups(context, { limit: 25 });
    });

    expect(rows.map((row) => row.documentId).sort()).toEqual([failedId, pendingId].sort());
    expect(storage.removeCalls).toBe(0);
  });

  it('runDocumentCleanupOpsWorker reports candidates without deleting storage', async () => {
    await seedDeletedDocument('report-failed.jpg', { status: 'failed' });
    await seedDeletedDocument('report-pending.jpg', { status: 'pending' });
    await seedDeletedDocument('report-done.jpg', { status: 'succeeded' });

    const report = await runDocumentCleanupOpsWorker({ limitPerOrg: 25 });

    expect(report.mode).toBe('report');
    expect(report.orgsScanned).toBeGreaterThanOrEqual(1);
    expect(report.candidates).toBeGreaterThanOrEqual(2);
    expect(report.sample.length).toBeGreaterThanOrEqual(2);
    expect(report.sample.every((row) => row.documentId && row.storageBackend)).toBe(true);
    expect(storage.removeCalls).toBe(0);
  });

  it('does not report live documents that were never deleted', async () => {
    await database.asService(async (db) => {
      await db.insert(documents).values({
        id: randomUUID(),
        organizationId,
        storageBackend: 'supabase_legacy',
        storageBucket: 'documents',
        storagePath: `${organizationId}/legacy/live.pdf`,
        originalFilename: 'live.pdf',
        mimeType: 'application/pdf',
        status: 'available',
      });
    });

    const rows = await database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'en',
      });
      return planFailedDocumentCleanups(context, { limit: 10 });
    });

    expect(rows).toEqual([]);
  });
});
