import { describe, expect, it } from 'vitest';
import { isVendorBillUnallocatedForCompleteness } from '@/modules/month-close/domain/completeness-ap-signals';

describe('month-close completeness — vendor bill NET vs allocation', () => {
  it('does not flag a bill when allocations cover NET (1000) even if gross is 1170', () => {
    expect(isVendorBillUnallocatedForCompleteness('1000', '1170', 1000)).toBe(false);
  });

  it('does not flag a bill when NET is null and allocations cover total fallback', () => {
    expect(isVendorBillUnallocatedForCompleteness(null, '1000', 1000)).toBe(false);
  });

  it('flags a bill when allocations are short of NET', () => {
    expect(isVendorBillUnallocatedForCompleteness('1000', '1170', 800)).toBe(true);
  });
});
