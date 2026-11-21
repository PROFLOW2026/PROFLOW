import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { TakeoffError } from '@/modules/electrical-takeoff/domain/errors';

vi.mock('@/shared/db/service-role-write', () => ({
  asServiceRoleWrite: async (_db: unknown, fn: () => Promise<unknown>) => fn(),
}));

const listCatalogOverrides = vi.fn();
const upsertCatalogType = vi.fn();

vi.mock('@/modules/electrical-takeoff/data/takeoff.repository', () => ({
  listCatalogOverrides: (...args: unknown[]) => listCatalogOverrides(...args),
  upsertCatalogType: (...args: unknown[]) => upsertCatalogType(...args),
}));

const { createOrgCatalogTypeUseCase, isPgUniqueViolation, updateOrgCatalogTypeUseCase } = await import(
  '@/modules/electrical-takeoff/application/org-catalog'
);

function context(permissions: string[]): OrgContext {
  return {
    organizationId: 'org-a',
    userId: 'user-a',
    permissions: new Set(permissions),
    db: { execute: vi.fn(async () => undefined) },
  } as unknown as OrgContext;
}

describe('org catalog write', () => {
  beforeEach(() => {
    listCatalogOverrides.mockReset();
    upsertCatalogType.mockReset();
    listCatalogOverrides.mockResolvedValue([]);
    upsertCatalogType.mockImplementation(async (_db: unknown, row: { payload: unknown; key: string }) => ({
      payload: row.payload,
      key: row.key,
    }));
  });

  it('refuses create without takeoff.library.manage before any write', async () => {
    const ctx = context([PERMISSIONS.TAKEOFF_MANAGE]);
    await expect(
      createOrgCatalogTypeUseCase(ctx, { category: 'control', nameHe: 'לחצן חדר מדרגות' }),
    ).rejects.toMatchObject({ takeoffCode: 'forbidden' });
    expect(upsertCatalogType).not.toHaveBeenCalled();
  });

  it('creates a custom control type with empty keywords and a stable custom key', async () => {
    const saved = await createOrgCatalogTypeUseCase(context([PERMISSIONS.TAKEOFF_LIBRARY_MANAGE]), {
      category: 'control',
      nameHe: 'לחצן חדר מדרגות',
    });
    expect(saved.key.startsWith('custom.control.')).toBe(true);
    expect(saved.nameHe).toBe('לחצן חדר מדרגות');
    expect(saved.keywordsHe).toEqual([]);
    expect(saved.builtIn).toBe(false);
    expect(upsertCatalogType).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate name against a built-in type', async () => {
    await expect(
      createOrgCatalogTypeUseCase(context([PERMISSIONS.TAKEOFF_LIBRARY_MANAGE]), {
        category: 'control',
        nameHe: 'מפסק יחיד',
      }),
    ).rejects.toMatchObject({ takeoffCode: 'catalog_duplicate' });
    expect(upsertCatalogType).not.toHaveBeenCalled();
  });

  it('maps a unique-violation from a concurrent insert to catalog_duplicate', async () => {
    upsertCatalogType.mockRejectedValue({ code: '23505', constraint: 'takeoff_catalog_types_org_name_active_uq' });
    await expect(
      createOrgCatalogTypeUseCase(context([PERMISSIONS.TAKEOFF_LIBRARY_MANAGE]), {
        category: 'control',
        nameHe: 'לחצן חדר מדרגות',
      }),
    ).rejects.toBeInstanceOf(TakeoffError);
    await expect(
      createOrgCatalogTypeUseCase(context([PERMISSIONS.TAKEOFF_LIBRARY_MANAGE]), {
        category: 'control',
        nameHe: 'לחצן חדר מדרגות',
      }),
    ).rejects.toMatchObject({ takeoffCode: 'catalog_duplicate' });
  });

  it('detects postgres unique violations through wrapped causes', () => {
    expect(isPgUniqueViolation({ cause: { code: '23505' } })).toBe(true);
    expect(isPgUniqueViolation({ code: '23503' })).toBe(false);
  });

  it('keeps the original key when renaming a custom type', async () => {
    listCatalogOverrides.mockResolvedValue([
      {
        key: 'custom.control.aaaaaaaaaaaa',
        archived: false,
        payload: {
          key: 'custom.control.aaaaaaaaaaaa',
          category: 'control',
          role: 'device',
          nameHe: 'לחצן חדר מדרגות',
          unit: "יח'",
          keywordsHe: [],
          colorHex: '#7f7f7f',
          builtIn: false,
          archived: false,
        },
      },
    ]);
    const saved = await updateOrgCatalogTypeUseCase(context([PERMISSIONS.TAKEOFF_LIBRARY_MANAGE]), {
      key: 'custom.control.aaaaaaaaaaaa',
      nameHe: 'לחצן מדרגות',
    });
    expect(saved.key).toBe('custom.control.aaaaaaaaaaaa');
    expect(saved.nameHe).toBe('לחצן מדרגות');
  });
});
