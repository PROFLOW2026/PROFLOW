import { describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  canCreateOrganizationSavedListView,
  canMutateSavedListView,
} from '@/modules/tenancy/domain/saved-list-view-access';
import {
  mergeSavedListViewsForListing,
  type SavedListViewRecord,
} from '@/modules/tenancy/domain/saved-list-views';
import { saveSavedListViewSchema } from '@/modules/tenancy/validation/saved-list-views';
import { saveSavedListView } from '@/modules/tenancy/application/saved-list-views';

vi.mock('@/modules/tenancy/data/saved-list-views.repository', () => ({
  listSavedListViewsForOrgMember: vi.fn(),
  findSavedListViewByName: vi.fn(),
  countSavedListViewsCreatedByUser: vi.fn(),
  clearDefaultSavedListViews: vi.fn(),
  insertSavedListView: vi.fn(),
  updateSavedListViewByIdInOrg: vi.fn(),
  findSavedListViewByIdInOrg: vi.fn(),
  deleteSavedListViewByIdInOrg: vi.fn(),
}));

import {
  findSavedListViewByName,
  insertSavedListView,
  listSavedListViewsForOrgMember,
} from '@/modules/tenancy/data/saved-list-views.repository';

function view(partial: Partial<SavedListViewRecord> & Pick<SavedListViewRecord, 'id' | 'scope'>): SavedListViewRecord {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    listKey: 'tasks',
    name: 'View',
    query: {},
    isDefault: false,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function context(userId: string, permissions: readonly string[]): OrgContext {
  return {
    userId,
    organizationId: 'org-1',
    membershipId: 'mem-1',
    permissions: new Set(permissions) as OrgContext['permissions'],
    db: { tag: 'mock-db' },
  } as unknown as OrgContext;
}

describe('mergeSavedListViewsForListing', () => {
  it('dedupes by id and prefers the organization list entry on collision', () => {
    const shared = view({
      id: 'dup',
      scope: 'organization',
      name: 'Org copy',
      updatedAt: new Date('2026-02-01T00:00:00Z'),
    });
    const mine = view({
      id: 'dup',
      scope: 'private',
      name: 'Private copy',
      updatedAt: new Date('2026-03-01T00:00:00Z'),
    });
    const onlyPrivate = view({ id: 'p1', scope: 'private' });

    const merged = mergeSavedListViewsForListing([mine, onlyPrivate], [shared]);
    expect(merged.map((entry) => entry.id).sort()).toEqual(['dup', 'p1']);
    expect(merged.find((entry) => entry.id === 'dup')?.name).toBe('Org copy');
  });

  it('sorts defaults first then by updatedAt descending', () => {
    const older = view({
      id: 'a',
      scope: 'private',
      isDefault: false,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = view({
      id: 'b',
      scope: 'organization',
      isDefault: false,
      updatedAt: new Date('2026-06-01T00:00:00Z'),
    });
    const def = view({
      id: 'c',
      scope: 'private',
      isDefault: true,
      updatedAt: new Date('2025-01-01T00:00:00Z'),
    });

    expect(mergeSavedListViewsForListing([older], [newer, def]).map((entry) => entry.id)).toEqual([
      'c',
      'b',
      'a',
    ]);
  });
});

describe('saved list view access', () => {
  it('allows org publish only with settings manage', () => {
    const admin = context('user-a', [PERMISSIONS.SETTINGS_MANAGE]);
    const member = context('user-b', [PERMISSIONS.PROJECTS_READ]);
    expect(canCreateOrganizationSavedListView(admin)).toBe(true);
    expect(canCreateOrganizationSavedListView(member)).toBe(false);
  });

  it('allows mutating organization views for creator or settings manage', () => {
    const orgView = view({ id: 'o1', scope: 'organization', userId: 'creator' });
    const creator = context('creator', []);
    const admin = context('other', [PERMISSIONS.SETTINGS_MANAGE]);
    const stranger = context('other', [PERMISSIONS.PROJECTS_READ]);

    expect(canMutateSavedListView(creator, orgView)).toBe(true);
    expect(canMutateSavedListView(admin, orgView)).toBe(true);
    expect(canMutateSavedListView(stranger, orgView)).toBe(false);
  });

  it('restricts private views to the owning user', () => {
    const privateView = view({ id: 'p1', scope: 'private', userId: 'owner' });
    expect(canMutateSavedListView(context('owner', []), privateView)).toBe(true);
    expect(canMutateSavedListView(context('other', [PERMISSIONS.SETTINGS_MANAGE]), privateView)).toBe(
      false,
    );
  });
});

describe('listSavedListViewsForOrgMember wiring', () => {
  it('returns merged private and organization views from the repository', async () => {
    const privateView = view({ id: 'p1', scope: 'private' });
    const orgView = view({ id: 'o1', scope: 'organization' });
    vi.mocked(listSavedListViewsForOrgMember).mockResolvedValueOnce(
      mergeSavedListViewsForListing([privateView], [orgView]),
    );

    const { listSavedListViews } = await import('@/modules/tenancy/application/saved-list-views');
    const rows = await listSavedListViews(context('user-1', []), 'tasks');
    expect(rows.map((row) => row.id)).toEqual(['p1', 'o1']);
    expect(listSavedListViewsForOrgMember).toHaveBeenCalledWith(
      context('user-1', []).db,
      'org-1',
      'user-1',
      'tasks',
    );
  });
});

describe('saveSavedListView organization guard', () => {
  it('rejects organization scope without settings manage', async () => {
    vi.mocked(findSavedListViewByName).mockResolvedValue(null);

    await expect(
      saveSavedListView(context('user-1', []), {
        listKey: 'tasks',
        name: 'Shared',
        query: {},
        scope: 'organization',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('accepts organization scope when settings manage is held', async () => {
    const created = view({ id: 'n1', scope: 'organization', name: 'Shared' });
    vi.mocked(findSavedListViewByName).mockResolvedValue(null);
    const { countSavedListViewsCreatedByUser } = await import(
      '@/modules/tenancy/data/saved-list-views.repository'
    );
    vi.mocked(countSavedListViewsCreatedByUser).mockResolvedValue(0);
    vi.mocked(insertSavedListView).mockResolvedValue(created);

    const parsed = saveSavedListViewSchema.parse({
      listKey: 'tasks',
      name: 'Shared',
      query: {},
      scope: 'organization',
    });

    const result = await saveSavedListView(context('user-1', [PERMISSIONS.SETTINGS_MANAGE]), parsed);
    expect(result.scope).toBe('organization');
    expect(insertSavedListView).toHaveBeenCalledWith(
      context('user-1', [PERMISSIONS.SETTINGS_MANAGE]).db,
      expect.objectContaining({ scope: 'organization' }),
    );
  });
});
