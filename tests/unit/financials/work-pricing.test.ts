import { describe, expect, it } from 'vitest';
import {
  hasRevenueBasisForProfitability,
  isEligibleForContractWeightAllocation,
  isOpenPriceJob,
} from '@/modules/financials/domain/work-pricing';

describe('work-pricing revenue basis', () => {
  it('gates open-price jobs', () => {
    expect(isOpenPriceJob('job', 'open')).toBe(true);
    expect(hasRevenueBasisForProfitability('job', 'open')).toBe(false);
    expect(isEligibleForContractWeightAllocation('job', 'open')).toBe(false);
  });

  it('gates jobs without managed contract when known', () => {
    expect(
      hasRevenueBasisForProfitability('job', 'fixed', { hasManagedContract: false }),
    ).toBe(false);
    expect(
      hasRevenueBasisForProfitability('job', 'fixed', { hasManagedContract: true }),
    ).toBe(true);
    // Unknown contract presence: pricing_mode alone (fixed) still allows.
    expect(hasRevenueBasisForProfitability('job', 'fixed')).toBe(true);
  });

  it('gates classic projects without managed contract (R-004)', () => {
    expect(
      hasRevenueBasisForProfitability('project', null, { hasManagedContract: false }),
    ).toBe(false);
    expect(hasRevenueBasisForProfitability('project', null)).toBe(true);
  });
});
