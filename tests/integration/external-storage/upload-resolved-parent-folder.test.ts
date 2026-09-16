import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { sql } from 'drizzle-orm';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { sealOAuthPayload } from '@/modules/external-storage/application/token-seal';
import * as folderProvisioning from '@/modules/external-storage/application/folder-provisioning';
import * as providerRegistry from '@/modules/external-storage/providers/registry';
import { uploadDocumentToExternalStorage } from '@/modules/external-storage/server';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { seedOrganizationStorageConnection } from '../../setup/external-storage-fixture';
import { createTestUser, seedSystem } from '../../setup/fixtures';

describe('uploadDocumentToExternalStorage resolved parent folder', () => {
  let database: TestDatabase;
  let resolveUploadFolderIdSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    database = await createTestDatabase();
    resolveUploadFolderIdSpy = vi.spyOn(folderProvisioning, 'resolveUploadFolderId');
    vi.spyOn(providerRegistry, 'getStorageProviderAdapter').mockReturnValue({
      uploadFile: vi.fn().mockResolvedValue({
        id: 'provider-file-id',
        name: 'test.pdf',
        parentId: 'pre-resolved-folder',
        etag: 'etag-1',
        sizeBytes: 4,
        mimeType: 'application/pdf',
        modifiedAt: new Date(),
      }),
    } as never);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    resolveUploadFolderIdSpy.mockClear();
  });

  it('does not re-resolve semantic folder when resolvedParentFolderId is provided', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'upload-resolved-parent@example.test');
    const { organization } = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Upload Resolved Parent', countryCode: 'IL' }),
    );
    const connectionId = await database.asService(async (db) =>
      seedOrganizationStorageConnection(db, organization.id, owner.id, 'onedrive'),
    );
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: organization.id,
        locale: 'en',
      });

      await asServiceRoleWrite(context.db, async () => {
        const sealed = sealOAuthPayload({
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          scopes: ['Files.ReadWrite'],
        });
        await context.db.execute(sql`
          INSERT INTO app.storage_connection_credential_refs (
            organization_id, connection_id, credentials_ref, token_expires_at
          ) VALUES (
            ${organization.id}::uuid,
            ${connectionId}::uuid,
            ${sealed},
            ${new Date(Date.now() + 3_600_000).toISOString()}
          )
        `);
      });

      const prepared = await prepareDocumentUpload(context, {
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        ownerType: 'organization',
        ownerId: organization.id,
      });

      await uploadDocumentToExternalStorage(context, {
        documentId: prepared.document.id,
        parentSemanticFolder: 'employees_root',
        entityType: 'organization',
        entityId: organization.id,
        resolvedParentFolderId: 'pre-resolved-folder-id',
        fileName: 'test.pdf',
        mimeType: 'application/pdf',
        body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        sizeBytes: 4,
      });

      expect(resolveUploadFolderIdSpy).not.toHaveBeenCalled();
    });
  });
});
