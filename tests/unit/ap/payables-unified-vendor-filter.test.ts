import { describe, expect, it } from 'vitest';
import { billMatchesPayablesFilters } from '@/modules/ap/application/payables';

describe('billMatchesPayablesFilters unified vendor ids', () => {
  const canonical = '67540aa1-81cb-4903-a55b-483a4c7685c3';
  const alias = '9056eb27-a43d-462b-9b9f-2afc3d813bb1';
  const other = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  it('matches bills on linked vendor ids', () => {
    expect(
      billMatchesPayablesFilters(
        { vendorId: alias, projectId: null },
        { unifiedVendorIds: [canonical, alias] },
      ),
    ).toBe(true);
    expect(
      billMatchesPayablesFilters(
        { vendorId: other, projectId: null },
        { unifiedVendorIds: [canonical, alias] },
      ),
    ).toBe(false);
  });

  it('does not merge unrelated vendors when only single vendorId is set', () => {
    expect(
      billMatchesPayablesFilters({ vendorId: alias, projectId: null }, { vendorId: canonical }),
    ).toBe(false);
  });
});
