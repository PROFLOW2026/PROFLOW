import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { attachFilesToOwner } from '@/modules/documents/application/attach-files-to-owner';
import { listEntityDocuments } from '@/modules/documents/application/upload-document';
import { createProject } from '@/modules/projects';
import {
  createTask,
  linkDocumentToTask,
  listTaskAttachments,
  unlinkDocumentFromTask,
} from '@/modules/tasks';
import { createWorkspace, linkProjectToWorkspace } from '@/modules/workspaces';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { StoragePort } from '@/shared/ports/storage';
import { setStoragePort } from '@/shared/ports/storage';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import {
  installExternalStorageServerMocks,
  restoreExternalStorageServerMocks,
  seedOrganizationStorageConnection,
} from '../../setup/external-storage-fixture';
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
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    return { bytes, contentType: 'application/pdf', size: bytes.length };
  }

  async remove(key: string) {
    this.keys.delete(key);
  }
}

describe('task attachments link/unlink permissions', () => {
  let database: TestDatabase;
  let storage: MockStoragePort;
  let ownerId: string;
  let organizationId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    storage = new MockStoragePort();
    setStoragePort(storage);
    installExternalStorageServerMocks();
  });

  afterAll(async () => {
    restoreExternalStorageServerMocks();
    setStoragePort(undefined);
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    storage.keys.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(init?.method ?? '').toUpperCase() === 'PUT') {
          return new Response(null, { status: 200 });
        }
        return new Response(null, { status: 404 });
      }),
    );

    await seedSystem(database);
    const owner = await createTestUser(database, `task-attach-${Date.now()}@example.test`);
    ownerId = owner.id;
    const created = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Task Attach Co', countryCode: 'IL' }),
    );
    organizationId = created.organization.id;
    await database.asService(async (db) => {
      await seedOrganizationStorageConnection(db, organizationId, owner.id);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function withContext<T>(fn: (context: OrgContext) => Promise<T>): Promise<T> {
    return database.asUser(ownerId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: ownerId,
        organizationId,
        locale: 'he-IL',
      });
      return fn(context);
    });
  }

  async function seedTaskWithProjectDocument(context: OrgContext) {
    const { projectId } = await createProject(context, { name: 'North site' });
    const workspace = await createWorkspace(context, {
      name: 'PM workspace',
      workspaceType: 'project_linked',
      workspaceVisibility: 'organization',
    });
    await linkProjectToWorkspace(context, workspace.id, projectId);
    const task = await createTask(context, {
      workspaceId: workspace.id,
      projectId,
      title: 'Install door',
    });

    const attached = await attachFilesToOwner(context, {
      ownerType: 'project',
      ownerId: projectId,
      files: [
        new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'plan.pdf', {
          type: 'application/pdf',
        }),
      ],
    });
    expect(attached.attached).toBe(1);

    const projectDocs = await listEntityDocuments(context, {
      ownerType: 'project',
      ownerId: projectId,
    });

    return { task, documentId: projectDocs[0]!.id };
  }

  it('links and unlinks a project document on a task', async () => {
    await withContext(async (context) => {
      const { task, documentId } = await seedTaskWithProjectDocument(context);

      const link = await linkDocumentToTask(context, task.id, documentId);
      expect(link.ownerType).toBe('task');
      expect(link.ownerId).toBe(task.id);

      const attached = await listTaskAttachments(context, task.id);
      expect(attached).toHaveLength(1);
      expect(attached[0]?.id).toBe(documentId);

      await unlinkDocumentFromTask(context, task.id, link.id);

      const afterUnlink = await listTaskAttachments(context, task.id);
      expect(afterUnlink).toHaveLength(0);
    });
  });

  it('refuses link without documents.manage', async () => {
    await withContext(async (context) => {
      const { task, documentId } = await seedTaskWithProjectDocument(context);
      const denied = {
        ...context,
        permissions: new Set(
          [...context.permissions].filter((key) => key !== PERMISSIONS.DOCUMENTS_MANAGE),
        ),
      };

      await expect(linkDocumentToTask(denied, task.id, documentId)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  });

  it('refuses unlink without documents.manage', async () => {
    await withContext(async (context) => {
      const { task, documentId } = await seedTaskWithProjectDocument(context);
      const link = await linkDocumentToTask(context, task.id, documentId);

      const denied = {
        ...context,
        permissions: new Set(
          [...context.permissions].filter((key) => key !== PERMISSIONS.DOCUMENTS_MANAGE),
        ),
      };

      await expect(unlinkDocumentFromTask(denied, task.id, link.id)).rejects.toBeInstanceOf(
        AuthorizationError,
      );
    });
  });

  it('refuses list without documents.read', async () => {
    await withContext(async (context) => {
      const { task } = await seedTaskWithProjectDocument(context);
      const denied = {
        ...context,
        permissions: new Set(
          [...context.permissions].filter((key) => key !== PERMISSIONS.DOCUMENTS_READ),
        ),
      };

      await expect(listTaskAttachments(denied, task.id)).rejects.toBeInstanceOf(AuthorizationError);
    });
  });
});
