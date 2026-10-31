import { describe, expect, it } from 'vitest';
import { buildVendorAggregateScopeFromTree } from '@/modules/vendors/domain/resolve-vendor-aggregate-ids';

describe('buildVendorAggregateScopeFromTree', () => {
  const canonical = '67540aa1-81cb-4903-a55b-483a4c7685c3';
  const alias = '9056eb27-a43d-462b-9b9f-2afc3d813bb1';
  const unrelated = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('includes canonical and linked child when viewing the primary vendor', () => {
    const scope = buildVendorAggregateScopeFromTree(canonical, null, [canonical, alias]);
    expect(scope.canonicalVendorId).toBe(canonical);
    expect(scope.expenseVendorIds).toEqual(expect.arrayContaining([canonical, alias]));
    expect(scope.aliasVendorIds).toEqual([alias]);
  });

  it('includes both ids when viewing the linked child', () => {
    const scope = buildVendorAggregateScopeFromTree(alias, canonical, [canonical, alias]);
    expect(scope.canonicalVendorId).toBe(canonical);
    expect(scope.expenseVendorIds).toEqual(expect.arrayContaining([canonical, alias]));
  });

  it('does not merge vendors with similar names that are not in the parent tree', () => {
    const scope = buildVendorAggregateScopeFromTree(canonical, null, [canonical]);
    expect(scope.expenseVendorIds).toEqual([canonical]);
    expect(scope.expenseVendorIds).not.toContain(unrelated);
  });

  it('keeps a standalone vendor scoped to itself', () => {
    const scope = buildVendorAggregateScopeFromTree(unrelated, null, [unrelated]);
    expect(scope.expenseVendorIds).toEqual([unrelated]);
    expect(scope.aliasVendorIds).toEqual([]);
  });
});
