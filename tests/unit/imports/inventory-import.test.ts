import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { previewImport } from '@/modules/imports/application/preview-import';
import { confirmImport } from '@/modules/imports/application/confirm-import';
import { listImportableKinds } from '@/modules/imports/application/import-permissions';
import { autoMapColumns } from '@/modules/imports/domain/column-mapping';
import { isEnabledImportKind } from '@/modules/imports/domain/types';
import { validateMappedValues, rowHasErrors } from '@/modules/imports/validation/validate-rows';
import { createInventoryItem } from '@/modules/assets';

vi.mock('@/modules/assets', () => ({
  createInventoryItem: vi.fn(async (_context: unknown, input: { name: string }) => ({
    id: 'inv-created',
    name: input.name,
  })),
}));

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

describe('inventory import kind', () => {
  beforeEach(() => {
    vi.mocked(createInventoryItem).mockClear();
  });

  it('is an enabled confirm kind', () => {
    expect(isEnabledImportKind('inventory')).toBe(true);
  });

  it('lists inventory when assets.manage is present', () => {
    const context = contextWith([PERMISSIONS.ASSETS_MANAGE]);
    expect(listImportableKinds(context)).toEqual(['inventory']);
  });

  it('auto-maps qty fields including opening qty', () => {
    const headers = ['Name', 'SKU', 'Unit', 'Barcode', 'Reorder level', 'Min stock', 'Opening qty'];
    const mapping = autoMapColumns('inventory', headers);
    expect(mapping.name).toBe(0);
    expect(mapping.sku).toBe(1);
    expect(mapping.unit).toBe(2);
    expect(mapping.barcode).toBe(3);
    expect(mapping.reorderLevel).toBe(4);
    expect(mapping.minStockLevel).toBe(5);
    expect(mapping.openingQty).toBe(6);
  });

  it('preview validates inventory rows without writing', () => {
    const context = contextWith([PERMISSIONS.ASSETS_MANAGE]);
    const preview = previewImport(context, {
      kind: 'inventory',
      csvText: 'name,sku,unit,barcode,reorder_level,min_stock_level,opening_qty\nNYM cable,C-1,m,7290001,50,20,100\n',
    });
    expect(preview.enabled).toBe(true);
    expect(preview.validCount).toBe(1);
    expect(rowHasErrors(preview.rows[0]!)).toBe(false);
    expect(preview.rows[0]!.values.openingQty).toBe('100');
  });

  it('rejects invalid opening qty', () => {
    const issues = validateMappedValues('inventory', {
      name: 'Cable',
      openingQty: '-3',
    });
    expect(issues.some((i) => i.field === 'openingQty' && i.severity === 'error')).toBe(true);
  });

  it('confirms via createInventoryItem with qty-only opening receive', async () => {
    const context = contextWith([PERMISSIONS.ASSETS_MANAGE]);
    const csv =
      'name,sku,unit,barcode,reorder_level,min_stock_level,opening_qty\nNYM cable,C-1,m,7290001,50,20,100\n';
    const result = await confirmImport(context, {
      kind: 'inventory',
      csvText: csv,
      mapping: autoMapColumns('inventory', [
        'name',
        'sku',
        'unit',
        'barcode',
        'reorder_level',
        'min_stock_level',
        'opening_qty',
      ]),
    });
    expect(result.created).toBe(1);
    expect(result.failed).toBe(0);
    expect(createInventoryItem).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createInventoryItem).mock.calls[0]?.[1]).toMatchObject({
      name: 'NYM cable',
      sku: 'C-1',
      unit: 'm',
      barcode: '7290001',
      quantityOnHand: '100',
      reorderLevel: '50',
      minStockLevel: '20',
    });
  });
});
