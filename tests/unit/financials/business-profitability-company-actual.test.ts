import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { money } from '@/shared/money';

vi.mock('@/modules/financials/application/get-home-dashboard', () => ({
  getHomeDashboard: vi.fn(),
}));

vi.mock('@/modules/financials/data/general-cost-months.repository', () => ({
  sumOrganizationGeneralPoolTotals: vi.fn(),
}));

import { getBusinessProfitability } from '@/modules/financials/application/get-business-profitability';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { sumOrganizationGeneralPoolTotals } from '@/modules/financials/data/general-cost-months.repository';

const getHomeDashboardMock = vi.mocked(getHomeDashboard);
const sumPoolMock = vi.mocked(sumOrganizationGeneralPoolTotals);

const context = {
  organizationId: 'org-1',
  organization: { timezone: 'Asia/Jerusalem', baseCurrency: 'ILS' },
  permissions: new Set([PERMISSIONS.PROJECT_FINANCIALS_READ]),
  db: {},
} as unknown as OrgContext;

function dashboard(companyActual: ReturnType<typeof money> | null) {
  return {
    totalContractValue: money('1000', 'ILS'),
    totalActualCost: money('100', 'ILS'),
    actualProfitTotal: money('900', 'ILS'),
    billing: null,
    apOutstanding: null,
    forecast: {
      totalAllocatedOverhead: money('40', 'ILS'),
      companyActual,
      companyProfit: null,
      totalRemainingCommitments: null,
      totalExpectedRemaining: null,
      totalForecastFinalCost: null,
      totalForecastMargin: null,
    },
  };
}

describe('getBusinessProfitability company actual', () => {
  beforeEach(() => {
    getHomeDashboardMock.mockReset();
    sumPoolMock.mockReset();
  });

  it('companyOnlyCost matches unallocatable and reconciles comes from compose', async () => {
    getHomeDashboardMock.mockResolvedValue(dashboard(money('180', 'ILS')) as never);
    sumPoolMock.mockResolvedValue({
      pool: '80.000000',
      allocated: '40.000000',
      unallocatable: '10.000000',
    });

    const data = await getBusinessProfitability(context);
    expect(data?.companyOnlyCost.value).toEqual(money('10.000000', 'ILS'));
    expect(data?.unallocatableGeneral.value).toEqual(money('10.000000', 'ILS'));
    expect(data?.allocatedOverhead.value).toEqual(money('40', 'ILS'));
    expect(data?.companyActual.value).toEqual(money('180', 'ILS'));
    expect(data?.reconcilesCompanyActual).toBe(false);
  });

  it('reports reconcile true when the pool conserves even if company actual is withheld', async () => {
    getHomeDashboardMock.mockResolvedValue(dashboard(null) as never);
    sumPoolMock.mockResolvedValue({
      pool: '100.000000',
      allocated: '60.000000',
      unallocatable: '40.000000',
    });

    const data = await getBusinessProfitability(context);
    expect(data?.reconcilesCompanyActual).toBe(true);
    expect(data?.companyOnlyCost.value?.amount).toBe('40.000000');
    expect(data?.companyActual.value).toBeNull();
  });
});
