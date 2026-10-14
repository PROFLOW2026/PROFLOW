import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  confirmProjectCoverUpload,
  createProject,
  findProjectById,
  getProjectCoverViewUrl,
  prepareProjectCoverUpload,
  removeProjectCover,
} from '@/modules/projects';
import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  applyPendingJournalMigrations,
  GATE_A_PG_LITE_SCHEMA_PARITY,
} from '@tests/setup/pending-journal-migrations';
import { provisionTwoTenants } from './setup';

class MockStoragePort implements StoragePort {
  readonly configured = true;
  readonly objects = new Map<string, Uint8Array>();

  buildKey(input: {
    organizationId: string;
    entityType: string;
    entityId: string;
    fileName: string;
  }): string {
    const unique = crypto.randomUUID();
    return `${input.organizationId}/${input.entityType}/${input.entityId}/${unique}.png`;
  }

  async createUploadUrl(key: string) {
    this.objects.set(key, new Uint8Array([1, 2, 3]));
    return {
      url: `https://storage.test/upload/${encodeURIComponent(key)}`,
      token: 'tok',
      path: key,
      expiresAt: new Date(Date.now() + 3600_000),
    };
  }

  async createDownloadUrl(key: string) {
    if (!this.objects.has(key)) throw new Error('missing');
    return {
      url: `https://storage.test/download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + 300_000),
    };
  }

  async downloadBytes(key: string) {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('missing');
    return { bytes, contentType: 'image/png', size: bytes.length };
  }

  async remove() {}
}

describe('project cover image (0191 PGlite)', () => {
  let database: TestDatabase;
  let storage: MockStoragePort;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyPendingJournalMigrations(database, GATE_A_PG_LITE_SCHEMA_PARITY);
    storage = new MockStoragePort();
    setStoragePort(storage);
  });

  afterAll(async () => {
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.objects.clear();
  });

  it('persists cover metadata on confirm, replaces key, and clears on remove', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const { projectId, firstKey, secondKey } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const { projectId: id } = await createProject(context, { name: 'Cover Tower' });

      const prepared = await prepareProjectCoverUpload(context, {
        projectId: id,
        fileName: 'cover.png',
        mimeType: 'image/png',
        sizeBytes: 512,
        width: 800,
        height: 450,
      });

      await confirmProjectCoverUpload(context, {
        projectId: id,
        storageKey: prepared.storageKey,
        mimeType: 'image/png',
        sizeBytes: 512,
        width: 800,
        height: 450,
      });

      const afterFirst = await findProjectById(context.db, context.organizationId, id);
      expect(afterFirst?.coverImageKey).toBe(prepared.storageKey);
      expect(afterFirst?.coverImageWidth).toBe(800);

      const prepared2 = await prepareProjectCoverUpload(context, {
        projectId: id,
        fileName: 'cover2.png',
        mimeType: 'image/png',
        sizeBytes: 600,
        width: 640,
        height: 360,
      });

      await confirmProjectCoverUpload(context, {
        projectId: id,
        storageKey: prepared2.storageKey,
        mimeType: 'image/png',
        sizeBytes: 600,
        width: 640,
        height: 360,
      });

      return { projectId: id, firstKey: prepared.storageKey, secondKey: prepared2.storageKey };
    });

    expect(firstKey).not.toBe(secondKey);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });

      const replaced = await findProjectById(context.db, context.organizationId, projectId);
      expect(replaced?.coverImageKey).toBe(secondKey);

      await removeProjectCover(context, { projectId });
      const cleared = await findProjectById(context.db, context.organizationId, projectId);
      expect(cleared?.coverImageKey).toBeNull();
      expect(cleared?.coverImageContentType).toBeNull();
    });
  });

  it('rejects cross-org prepare/confirm/sign and blocks worker without projects.update', async () => {
    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);

    const { projectId, storageKey } = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const { projectId: id } = await createProject(context, { name: 'Org A Cover' });
      const prepared = await prepareProjectCoverUpload(context, {
        projectId: id,
        fileName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 100,
      });
      await confirmProjectCoverUpload(context, {
        projectId: id,
        storageKey: prepared.storageKey,
        mimeType: 'image/png',
        sizeBytes: 100,
      });
      return { projectId: id, storageKey: prepared.storageKey };
    });

    await database.asUser(userB.id, async (tx) => {
      const contextB = await resolveOrgContext(tx, {
        userId: userB.id,
        organizationId: orgB.organization.id,
        locale: 'en',
      });

      await expect(
        prepareProjectCoverUpload(contextB, {
          projectId,
          fileName: 'hack.png',
          mimeType: 'image/png',
          sizeBytes: 100,
        }),
      ).rejects.toBeInstanceOf(NotFoundError);

      await expect(
        confirmProjectCoverUpload(contextB, {
          projectId,
          storageKey,
          mimeType: 'image/png',
          sizeBytes: 100,
        }),
      ).rejects.toThrow();

      await expect(getProjectCoverViewUrl(contextB, storageKey)).rejects.toBeInstanceOf(
        DomainRuleError,
      );

      const foreign = await findProjectById(contextB.db, contextB.organizationId, projectId);
      expect(foreign).toBeNull();
    });

    const workerEmail = `worker-${crypto.randomUUID().slice(0, 8)}@example.test`;
    const worker = await database.asService(async (db) => {
      const { createInvitation, acceptInvitation } = await import('@/modules/tenancy');
      const invitation = await database.asUser(userA.id, async (tx) => {
        const ownerContext = await resolveOrgContext(tx, {
          userId: userA.id,
          organizationId: orgA.organization.id,
          locale: 'en',
        });
        return createInvitation(ownerContext, { email: workerEmail, roleKey: 'worker' });
      });
      const { createTestUser } = await import('@tests/setup/fixtures');
      const user = await createTestUser(database, workerEmail);
      await acceptInvitation(db, {
        token: invitation.token,
        userId: user.id,
        userEmail: user.email,
      });
      return user;
    });

    await database.asUser(worker.id, async (tx) => {
      const workerContext = await resolveOrgContext(tx, {
        userId: worker.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      await expect(
        prepareProjectCoverUpload(workerContext, {
          projectId,
          fileName: 'nope.png',
          mimeType: 'image/png',
          sizeBytes: 50,
        }),
      ).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
