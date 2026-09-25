import { describe, expect, it } from 'vitest';
import { shouldPreserveRecordedActualEmployerCost } from '@/modules/workforce/application/monthly-cost-recompute';

describe('shouldPreserveRecordedActualEmployerCost', () => {
  it('keeps a recorded actual', () => {
    expect(
      shouldPreserveRecordedActualEmployerCost({
        knownQuality: 'actual',
        actualAmount: '12000.000000',
      }),
    ).toBe(true);
  });

  it('still refreshes estimated drafts', () => {
    expect(
      shouldPreserveRecordedActualEmployerCost({
        knownQuality: 'estimated',
        actualAmount: null,
      }),
    ).toBe(false);
    expect(
      shouldPreserveRecordedActualEmployerCost({
        knownQuality: 'actual',
        actualAmount: null,
      }),
    ).toBe(false);
    expect(shouldPreserveRecordedActualEmployerCost(null)).toBe(false);
  });
});
