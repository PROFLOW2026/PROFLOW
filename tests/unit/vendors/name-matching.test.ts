import { describe, expect, it } from 'vitest';
import { normalizeVendorName, vendorNamesMatch } from '@/modules/vendors';

describe('vendor name matching', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizeVendorName('  ABC   Electrical  ')).toBe('abc electrical');
  });

  it('matches equivalent names', () => {
    expect(vendorNamesMatch('ABC Electrical', 'abc  electrical')).toBe(true);
  });

  it('does not match different names', () => {
    expect(vendorNamesMatch('ABC Electrical', 'Beta Plumbing')).toBe(false);
  });
});
