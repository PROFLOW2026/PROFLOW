import { describe, expect, it } from 'vitest';
import { money, toNumericString } from '@/shared/money';
import {
  allocateConservedAmountByHours,
} from '@/modules/workforce/domain/conserved-hour-allocation';
import { calculateMonthlyEmployerCostPoolForMonth } from '@/modules/workforce/domain/employer-cost-pool';

/**
 * Bootstrap closure: open-period monthly pools for existing approved work
 * must persist without invented divisors / salary re-saves.
 */
describe('workforce costing bootstrap closure', () => {
  it('July and August pools are 9750 with 30% burden on 7500 base', () => {
    const versions = [
      {
        id: 'r1',
        validFrom: '2026-01-01',
        validTo: null as string | null,
        baseRate: '7500',
        currency: 'ILS',
        rateUnit: 'monthly' as const,
        burdenPercent: '30',
        components: [],
      },
    ];
    for (const yearMonth of ['2026-07', '2026-08'] as const) {
      const pool = calculateMonthlyEmployerCostPoolForMonth({
        yearMonth,
        currency: 'ILS',
        versions,
      })!;
      expect(toNumericString(pool.pool)).toBe('9750.000000');
      const alloc = allocateConservedAmountByHours({
        knownAmount: pool.pool,
        buckets: [{ key: 'choragin', hours: '100' }],
      });
      expect(toNumericString(alloc.allocatedToProjects)).toBe('9750.000000');
      expect(money(alloc.nonProjectOrUnallocated.amount, 'ILS').amount).toBe('0.000000');
    }
  });
});
