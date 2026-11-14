import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';

vi.mock('server-only', () => ({}));

import * as projectUploadFolder from '@/modules/external-storage/application/project-upload-folder';
import * as connectionService from '@/modules/external-storage/application/connection-service';
import * as storageAdminWrite from '@/modules/external-storage/data/storage-admin-write';
import * as providerRegistry from '@/modules/external-storage/providers/registry';
import { sealOAuthPayload } from '@/modules/external-storage/application/token-seal';
import { findDocumentById } from '@/modules/documents/data/documents.repository';
import { resolveOrgContext } from '@/modules/tenancy';
import { ServiceUnavailableError } from '@/shared/errors';
import {
  beginFileUploadUseCase,
  createAnalysisUseCase,
  getAnalysisViewUseCase,
} from '@/modules/electrical-takeoff/application/use-cases';
import { handleTakeoffChunk, resetChunkBuffersForTests } from '@/modules/electrical-takeoff/application/chunk-upload';
import { createOrgCloudTakeoffFileStore, setTakeoffFileStoreForTests } from '@/modules/electrical-takeoff/server';
import { resetTakeoffOrgFileStoreForTests } from '@/modules/electrical-takeoff/application/takeoff-org-file-store';
import type { DbExecutor } from '@/shared/db/types';
import type { TestDatabase } from '../../setup/database';
import { createTakeoffTestDatabase } from '../../setup/takeoff-integration-pglite';
import { seedOrganizationStorageConnection } from '../../setup/external-storage-fixture';
import { createTestOrganization, createTestUser, seedSystem } from '../../setup/fixtures';
import { createProjectAs } from '../../setup/dg-fixtures';

describe('takeoff org cloud file store', () => {
  let database: TestDatabase;
  let store: ReturnType<typeof createOrgCloudTakeoffFileStore>;
  /** PGlite deadlocks if `runCommittedStorageWrite` opens a second connection inside `asUser`. */
  let storageWriteExecutor: DbExecutor | null = null;
  const providerBytes = new Map<string, Uint8Array>();

  beforeAll(async () => {
    database = await createTakeoffTestDatabase();
    vi.spyOn(storageAdminWrite, 'runCommittedStorageWrite').mockImplementation(async (fn) => {
      if (storageWriteExecutor) return fn(storageWriteExecutor);
      return database.db.transaction((tx) => fn(tx));
    });
    vi.spyOn(projectUploadFolder, 'resolveProjectScopedUploadFolderId').mockResolvedValue('integration-upload-folder');
    vi.spyOn(connectionService, 'resolveValidAccessToken').mockResolvedValue('test-access-token');
    vi.spyOn(providerRegistry, 'getStorageProviderAdapter').mockReturnValue({
      uploadFile: vi.fn().mockImplementation(async (_token, input) => {
        const id = `provider-file-${createHash('sha256').update(input.fileName).digest('hex').slice(0, 12)}`;
        const body =
          input.body instanceof Uint8Array
            ? input.body
            : new Uint8Array(await new Response(input.body).arrayBuffer());
        providerBytes.set(id, body);
        return {
          id,
          name: input.fileName,
          parentId: input.parentFolderId,
          etag: 'etag-1',
          sizeBytes: body.length,
          mimeType: input.mimeType,
          modifiedAt: new Date(),
        };
      }),
      downloadFileStream: vi.fn().mockImplementation(async (_token, fileId) => {
        const bytes = providerBytes.get(fileId) ?? new Uint8Array();
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue(bytes);
              controller.close();
            },
          }),
          mimeType: 'application/pdf',
          sizeBytes: bytes.length,
        };
      }),
    } as never);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    providerBytes.clear();
    resetChunkBuffersForTests();
    resetTakeoffOrgFileStoreForTests();
    delete process.env.TAKEOFF_FILE_STORE;
    store = createOrgCloudTakeoffFileStore();
    setTakeoffFileStoreForTests(store);
    process.env.TAKEOFF_WORKER_SECRET = 'integration-test-secret-32chars!!';
  });

  async function seedStorageCredentials(organizationId: string, connectionId: string): Promise<void> {
    const sealed = sealOAuthPayload({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      scopes: ['Files.ReadWrite'],
    });
    await database.asService(async (db) => {
      await db.execute(sql`select set_config('role', 'service_role', true)`);
      await db.execute(sql`
        INSERT INTO app.storage_connection_credential_refs (
          organization_id, connection_id, credentials_ref, token_expires_at
        ) VALUES (
          ${organizationId}::uuid,
          ${connectionId}::uuid,
          ${sealed},
          ${new Date(Date.now() + 3_600_000).toISOString()}
        )
      `);
    });
  }

  it('uploads via org provider, worker download, export, and blocks other orgs', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'takeoff-storage@example.test');
    const { organization } = await createTestOrganization(database, owner, 'Storage Org');
    const connectionId = await database.asService((db) =>
      seedOrganizationStorageConnection(db, organization.id, owner.id, 'onedrive'),
    );
    await seedStorageCredentials(organization.id, connectionId);
    const projectId = await createProjectAs(database, owner.id, organization.id, 'Storage Tower');
    const pdfBytes = new TextEncoder().encode('%PDF-1.4 takeoff-org-store');

    let fileId = '';
    let analysisId = '';
    await database.asUser(owner.id, async (tx) => {
      storageWriteExecutor = tx;
      try {
        const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
        const analysis = await createAnalysisUseCase(ctx, projectId, { name: 'Org store' });
        analysisId = analysis.id;
        const begun = await beginFileUploadUseCase(ctx, analysis.id, {
          name: 'plan.pdf',
          sizeBytes: pdfBytes.length,
          kind: 'pdf',
        });
        fileId = begun.fileId;
        const pending = await findDocumentById(ctx.db, organization.id, fileId);
        expect(pending?.status).toBe('pending');

        await handleTakeoffChunk({
          db: ctx.db,
          store,
          organizationId: organization.id,
          projectId,
          fileId,
          kind: 'pdf',
          offset: 0,
          totalBytes: pdfBytes.length,
          sessionRaw: begun.fileId,
          bytes: pdfBytes,
        });

        const stored = await findDocumentById(ctx.db, organization.id, fileId);
        expect(stored?.status).toBe('available');
        expect(stored?.storageBackend).toBe('external');
      } finally {
        storageWriteExecutor = null;
      }
    });

    const ownerB = await createTestUser(database, 'takeoff-storage-b@example.test');
    const orgB = await createTestOrganization(database, ownerB, 'Other Org');
    await database.asUser(ownerB.id, async (tx) => {
      const ctxB = await resolveOrgContext(tx, {
        userId: ownerB.id,
        organizationId: orgB.organization.id,
        locale: 'he',
      });
      await expect(getAnalysisViewUseCase(ctxB, analysisId)).rejects.toBeTruthy();
    });

    await database.asUser(owner.id, async (tx) => {
      storageWriteExecutor = tx;
      try {
        const opened = await store.openReadStream({
          organizationId: organization.id,
          fileId,
          rangeHeader: null,
        });
        const body = new Uint8Array(await new Response(opened.body).arrayBuffer());
        expect(body.byteLength).toBe(pdfBytes.length);
      } finally {
        storageWriteExecutor = null;
      }
    });
  });

  it('uses ephemeral session upload when org has no connected storage', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'takeoff-nostorage@example.test');
    const { organization } = await createTestOrganization(database, owner, 'No Storage Org');
    const projectId = await createProjectAs(database, owner.id, organization.id, 'P');

    await database.asUser(owner.id, async (tx) => {
      storageWriteExecutor = tx;
      try {
        const ctx = await resolveOrgContext(tx, { userId: owner.id, organizationId: organization.id, locale: 'he' });
        const analysis = await createAnalysisUseCase(ctx, projectId, { name: 'X' });
        expect(analysis.persistenceMode).toBe('ephemeral');
        const begun = await beginFileUploadUseCase(ctx, analysis.id, { name: 'plan.pdf', sizeBytes: 8, kind: 'pdf' });
        expect(begun.fileId).toBeTruthy();
      } finally {
        storageWriteExecutor = null;
      }
    });
  });
});