import { describe, expect, it } from 'vitest';
import { normalizeVendorScopes } from '@/modules/portal/domain/vendor-scopes';

describe('vendor portal scopes', () => {
  it('keeps only known vendor scopes', () => {
    expect(normalizeVendorScopes(['vendor.summary', 'cost.write', 'documents.read'])).toEqual([
      'vendor.summary',
      'documents.read',
    ]);
  });
});
