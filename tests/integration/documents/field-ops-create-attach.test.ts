import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { attachFilesToOwner } from '@/modules/documents/application/attach-files-to-owner';
import { listEntityDocuments } from '@/modules/documents/application/upload-document';
import { createDailyLog } from '@/modules/field-ops';
import { createProject } from '@/modules/projects';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { createTestUser, seedSystem } from '../../setup/fixtures';

class MockStoragePort implements StoragePort {
  readonly configured = true;
  readonly keys = new Set<string>();
  readonly uploaded = new Set<string>();

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${input.fileName}`;
  }

  async createUploadUrl(key: string) {
    this.keys.add(key);
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
      token: 'test-upload-token',
      path: key,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async createDownloadUrl(key: string) {
    if (!this.keys.has(key)) throw new Error('missing object');
    return {
      url: `https://storage.test/download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async downloadBytes(key: string) {
    if (!this.keys.has(key)) throw new Error('missing object');
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    return { bytes, contentType: 'image/jpeg', size: bytes.length };
  }

  async remove(key: string) {
    this.keys.delete(key);
    this.uploaded.delete(key);
  }
}

describe('field-ops create then attach photos', () => {
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
    storage.uploaded.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method ?? '').toUpperCase() === 'PUT') {
          const url = String(input);
          const encoded = url.split('/upload/')[1] ?? '';
          storage.uploaded.add(decodeURIComponent(encoded));
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('links a staged photo to a new daily log through prepare-then-finalize', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'field-photos@example.test');
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Field Photos Co', countryCode: 'IL' }),
    );

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: created.organization.id,
        locale: 'he-IL',
      });

      const { projectId } = await createProject(context, { name: 'אתר צפון' });
      const log = await createDailyLog(context, {
        projectId,
        logDate: '2026-08-14',
        summary: 'יציקת רצפה',
      });

      const photo = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], 'קיר.jpg', {
        type: 'image/jpeg',
      });

      const result = await attachFilesToOwner(context, {
        ownerType: 'daily_log',
        ownerId: log.id,
        files: [photo],
      });

      expect(result).toEqual({ attached: 1, failed: 0 });

      const documents = await listEntityDocuments(context, {
        ownerType: 'daily_log',
        ownerId: log.id,
      });
      expect(documents).toHaveLength(1);
      expect(documents[0]?.originalFilename).toBe('קיר.jpg');
      expect(documents[0]?.status).toBe('available');
      expect(documents[0]?.storagePath.startsWith(`${created.organization.id}/`)).toBe(true);
    });
  });

  it('refuses attach without documents.manage', async () => {
    await seedSystem(database);
    const owner = await createTestUser(database, 'field-photos-denied@example.test');
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'No Docs Co', countryCode: 'IL' }),
    );

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: created.organization.id,
        locale: 'he-IL',
      });
      const denied = {
        ...context,
        permissions: new Set(
          [...context.permissions].filter((key) => key !== PERMISSIONS.DOCUMENTS_MANAGE),
        ),
      };

      const { projectId } = await createProject(context, { name: 'Site' });
      const log = await createDailyLog(context, {
        projectId,
        logDate: '2026-08-14',
        summary: 'work',
      });

      await expect(
        attachFilesToOwner(denied, {
          ownerType: 'daily_log',
          ownerId: log.id,
          files: [new File([new Uint8Array([1, 2, 3])], 'x.jpg', { type: 'image/jpeg' })],
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
