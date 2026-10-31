import { describe, expect, it } from 'vitest';
import { canonicalVendorIdFromMap } from '@/modules/vendors/domain/vendor-canonical-map';

describe('canonicalVendorIdFromMap', () => {
  it('returns parent when child is mapped', () => {
    const canonical = '67540aa1-81cb-4903-a55b-483a4c7685c3';
    const alias = '9056eb27-a43d-462b-9b9f-2afc3d813bb1';
    const map = new Map<string, string>([
      [canonical, canonical],
      [alias, canonical],
    ]);
    expect(canonicalVendorIdFromMap(map, alias)).toBe(canonical);
    expect(canonicalVendorIdFromMap(map, canonical)).toBe(canonical);
  });
});
