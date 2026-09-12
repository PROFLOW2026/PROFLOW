import { describe, expect, it } from 'vitest';
import {
  composeOrganizationCostBreakdown,
  shouldSurfaceOrganizationCostBreakdown,
} from '@/modules/financials/domain/organization-cost-breakdown';
import { money } from '@/shared/money';

describe('composeOrganizationCostBreakdown', () => {
  it('reconciles company actual into allocated + company only + unallocated', () => {
    const breakdown = composeOrganizationCostBreakdown({
      currency: 'ILS',
      directProjectActual: money('100000', 'ILS'),
      allocatedGeneralToProjects: money('15000', 'ILS'),
      companyActual: money('382000', 'ILS'),
      gcmUnallocatable: money('267000', 'ILS'),
      expenseCompanyOnly: money('5000', 'ILS'),
      laborCompanyOnly: money('243000', 'ILS'),
      apCompanyOnly: money('4000', 'ILS'),
    });

    expect(breakdown.allocated.amount).toBe('115000.000000');
    expect(breakdown.companyOnly.amount).toBe('252000.000000');
    expect(breakdown.unallocated.amount).toBe('15000.000000');
    expect(breakdown.reconciles).toBe(true);
    expect(breakdown.difference.amount).toBe('0.000000');
  });

  it('keeps owner salary in company only, not unallocated', () => {
    const breakdown = composeOrganizationCostBreakdown({
      currency: 'ILS',
      directProjectActual: money('50000', 'ILS'),
      allocatedGeneralToProjects: money('10000', 'ILS'),
      companyActual: money('303000', 'ILS'),
      gcmUnallocatable: money('243000', 'ILS'),
      expenseCompanyOnly: money('0', 'ILS'),
      laborCompanyOnly: money('243000', 'ILS'),
      apCompanyOnly: money('0', 'ILS'),
    });

    expect(breakdown.companyOnly.amount).toBe('243000.000000');
    expect(breakdown.unallocated.amount).toBe('0.000000');
    expect(breakdown.allocated.amount).toBe('60000.000000');
    expect(breakdown.reconciles).toBe(true);
  });

  it('surfaces when any card is non-zero', () => {
    const breakdown = composeOrganizationCostBreakdown({
      currency: 'ILS',
      directProjectActual: money('0', 'ILS'),
      allocatedGeneralToProjects: money('0', 'ILS'),
      companyActual: money('27000', 'ILS'),
      gcmUnallocatable: money('27000', 'ILS'),
      expenseCompanyOnly: money('0', 'ILS'),
      laborCompanyOnly: money('27000', 'ILS'),
      apCompanyOnly: money('0', 'ILS'),
    });
    expect(shouldSurfaceOrganizationCostBreakdown(breakdown)).toBe(true);
  });
});
