import { describe, expect, it } from 'vitest';
import { normalizeVendorLegalNameForAlias } from '@/modules/vendors/domain/normalize-vendor-legal-name';

describe('normalizeVendorLegalNameForAlias', () => {
  it('collapses Arca legal suffix variants', () => {
    expect(normalizeVendorLegalNameForAlias('ארכה בע"מ')).toBe(normalizeVendorLegalNameForAlias('ארכה'));
  });
});
