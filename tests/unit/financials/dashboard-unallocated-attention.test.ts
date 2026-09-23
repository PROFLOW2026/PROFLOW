import { describe, expect, it } from 'vitest';
import { buildDashboardMissingDataItems } from '@/modules/financials/domain/dashboard-missing-data';
import { money } from '@/shared/money';

describe('dashboard unallocated attention', () => {
  it('does not surface unallocated_remainder when only auto_pool overhead exists', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: {
        level: 'medium',
        reasons: ['unallocated_remainder'],
      },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('0', 'ILS'),
      unallocatedExpensePreview: {
        count: 0,
        amount: money('0', 'ILS'),
        samples: [],
      },
      openPriceProjectCount: 0,
      pricedProjectCount: 0,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    expect(items.some((item) => item.code === 'unallocated_remainder')).toBe(false);
  });

  it('surfaces unallocated_remainder only for actionable project_allocate shared expenses', () => {
    const items = buildDashboardMissingDataItems({
      dataConfidence: {
        level: 'medium',
        reasons: ['unallocated_remainder'],
      },
      costCoverage: null,
      contractValueCoverage: null,
      billingCoverage: null,
      unallocatedBusinessCosts: money('1500', 'ILS'),
      unallocatedExpensePreview: {
        count: 2,
        amount: money('1500', 'ILS'),
        samples: [
          {
            id: 'exp-1',
            expenseDate: '2026-03-01',
            description: 'Needs lines',
            supplierName: null,
            vendorName: null,
            netAmount: '750',
            currency: 'ILS',
          },
        ],
      },
      openPriceProjectCount: 0,
      pricedProjectCount: 0,
      excludedForeignCurrencyCount: 0,
      projectMissingCostSignals: [],
    });

    const unallocated = items.find((item) => item.code === 'unallocated_remainder');
    expect(unallocated).toBeDefined();
    expect(unallocated?.count).toBe(2);
    expect(Number(unallocated?.amount?.amount)).toBe(1500);
  });
});
