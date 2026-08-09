import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { prepareDocumentUpload } from '@/modules/documents/application/upload-document';
import { linkDocumentToEntity } from '@/modules/documents/application/link-document';
import { createProject } from '@/modules/projects';
import { createClient } from '@/modules/clients';
import { createVendor } from '@/modules/vendors';
import { NotFoundError } from '@/shared/errors';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class MockStoragePort implements StoragePort {
  readonly configured = true;

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${input.fileName}`;
  }

  async createUploadUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    return { url: `https://storage.test/upload/${encodeURIComponent(key)}`, expiresAt: new Date() };
  }

  async createDownloadUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
    return { url: `https://storage.test/download/${encodeURIComponent(key)}`, expiresAt: new Date() };
  }

  async remove(): Promise<void> {}
}

async function provisionTenant(database: TestDatabase, email: string, orgName: string) {
  await seedSystem(database);
  const owner = await createTestUser(database, email);
  const result = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name: orgName, countryCode: 'IL' }),
  );
  return { owner, organizationId: result.organization.id };
}

describe('client-supplied foreign keys', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
    setStoragePort(new MockStoragePort());
  });

  afterAll(async () => {
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('rejects document uploads linked to an entity in another organization', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const foreignVendorId = await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Foreign Vendor' });
      return vendor.id;
    });

    await expect(
      database.asUser(orgA.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgA.owner.id,
          organizationId: orgA.organizationId,
          locale: 'en',
        });
        await prepareDocumentUpload(context, {
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          ownerType: 'vendor',
          ownerId: foreignVendorId,
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects document links to a project in another organization', async () => {
    const orgA = await provisionTenant(database, 'owner-a-link@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b-link@example.test', 'Beta Construction');

    const documentId = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organizationId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Local Vendor' });
      const prepared = await prepareDocumentUpload(context, {
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 512,
        ownerType: 'vendor',
        ownerId: vendor.id,
      });
      return prepared.document.id;
    });

    const foreignProjectId = await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });
      const { projectId } = await createProject(context, { name: 'Foreign Project' });
      return projectId;
    });

    await expect(
      database.asUser(orgA.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgA.owner.id,
          organizationId: orgA.organizationId,
          locale: 'en',
        });
        await linkDocumentToEntity(context, {
          documentId,
          ownerType: 'project',
          ownerId: foreignProjectId,
        });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a project create with a client from another organization', async () => {
    const orgA = await provisionTenant(database, 'owner-a@example.test', 'Alpha Electrical');
    const orgB = await provisionTenant(database, 'owner-b@example.test', 'Beta Construction');

    const foreignClientId = await database.asUser(orgB.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgB.owner.id,
        organizationId: orgB.organizationId,
        locale: 'en',
      });
      const client = await createClient(context, { name: 'Foreign Client' });
      return client.id;
    });

    await expect(
      database.asUser(orgA.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgA.owner.id,
          organizationId: orgA.organizationId,
          locale: 'en',
        });
        await createProject(context, { name: 'Bad Link', clientId: foreignClientId });
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
