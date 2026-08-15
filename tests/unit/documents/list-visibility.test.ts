import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

const listAllDocuments = vi.fn();
const listDocumentsForEntity = vi.fn();
const resolveAccessibleProjectIds = vi.fn();
const assertCanAccessProject = vi.fn();

vi.mock('@/modules/documents/data/documents.repository', () => ({
  listAllDocuments: (...args: unknown[]) => listAllDocuments(...args),
  listDocumentsForEntity: (...args: unknown[]) => listDocumentsForEntity(...args),
  insertDocument: vi.fn(),
  insertDocumentLink: vi.fn(),
  updateDocumentById: vi.fn(),
  flushDocumentCurrentVersionGuards: vi.fn(),
}));

vi.mock('@/modules/projects/application/project-access', () => ({
  resolveAccessibleProjectIds: (...args: unknown[]) => resolveAccessibleProjectIds(...args),
  assertCanAccessProject: (...args: unknown[]) => assertCanAccessProject(...args),
}));

vi.mock('@/shared/ports/storage', () => ({
  getStoragePort: () => ({ configured: false }),
  StorageNotConfiguredError: class StorageNotConfiguredError extends Error {},
}));

import {
  listDocumentsForOrg,
  listEntityDocuments,
} from '@/modules/documents/application/upload-document';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('document list visibility', () => {
  beforeEach(() => {
    listAllDocuments.mockReset().mockResolvedValue([]);
    listDocumentsForEntity.mockReset().mockResolvedValue([]);
    resolveAccessibleProjectIds.mockReset().mockResolvedValue(null);
    assertCanAccessProject.mockReset().mockResolvedValue(undefined);
  });

  it('does not request compensation documents without workforce.cost.read', async () => {
    const context = contextWith([PERMISSIONS.DOCUMENTS_READ]);
    await listDocumentsForOrg(context, { search: 'paystub' });

    expect(listAllDocuments).toHaveBeenCalledWith(
      context.db,
      'org-1',
      expect.objectContaining({ includeCompensation: false, search: 'paystub' }),
    );
  });

  it('includes compensation documents when workforce.cost.read is granted', async () => {
    const context = contextWith([PERMISSIONS.DOCUMENTS_READ, PERMISSIONS.WORKFORCE_COST_READ]);
    await listDocumentsForOrg(context, {});

    expect(listAllDocuments).toHaveBeenCalledWith(
      context.db,
      'org-1',
      expect.objectContaining({ includeCompensation: true }),
    );
  });

  it('passes accessible project ids so project-linked documents are filtered in the app layer', async () => {
    resolveAccessibleProjectIds.mockResolvedValue(['proj-a']);
    const context = contextWith([PERMISSIONS.DOCUMENTS_READ]);
    await listDocumentsForOrg(context, {});

    expect(listAllDocuments).toHaveBeenCalledWith(
      context.db,
      'org-1',
      expect.objectContaining({ accessibleProjectIds: ['proj-a'] }),
    );
  });

  it('returns no project-filtered rows when the requested project is outside the allow-list', async () => {
    const allowedId = '01900000-0000-7000-8000-0000000000aa';
    const otherId = '01900000-0000-7000-8000-0000000000bb';
    resolveAccessibleProjectIds.mockResolvedValue([allowedId]);
    const context = contextWith([PERMISSIONS.DOCUMENTS_READ]);
    const rows = await listDocumentsForOrg(context, { projectId: otherId });

    expect(rows).toEqual([]);
    expect(listAllDocuments).not.toHaveBeenCalled();
  });

  it('asserts project access before listing entity documents on a project', async () => {
    const context = contextWith([PERMISSIONS.DOCUMENTS_READ]);
    await listEntityDocuments(context, {
      ownerType: 'project',
      ownerId: '01900000-0000-7000-8000-0000000000aa',
    });

    expect(assertCanAccessProject).toHaveBeenCalledWith(
      context,
      '01900000-0000-7000-8000-0000000000aa',
    );
    expect(listDocumentsForEntity).toHaveBeenCalledWith(
      context.db,
      'org-1',
      expect.objectContaining({ includeCompensation: false }),
    );
  });
});
