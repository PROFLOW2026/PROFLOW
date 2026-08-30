import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  refreshAllOpenGeneralCostMonthsForSurfaces,
  refreshCurrentOpenGeneralCostMonthForSurfaces,
  recomputeGeneralCostMonth,
} from '@/modules/financials/application/recompute-general-cost-month';
import * as recomputeModule from '@/modules/financials/application/recompute-general-cost-month';
import * as generalCostMonthsRepo from '@/modules/financials/data/general-cost-months.repository';

const context = {
  organizationId: 'org-1',
  organization: { timezone: 'Asia/Jerusalem', baseCurrency: 'ILS' },
  permissions: new Set([
    PERMISSIONS.PROJECT_FINANCIALS_READ,
    PERMISSIONS.EXPENSES_READ,
    PERMISSIONS.WORKFORCE_READ,
    PERMISSIONS.AP_READ,
  ]),
  db: {},
} as unknown as OrgContext;

describe('GCM read-surface stability', () => {
  it('refreshAllOpenGeneralCostMonthsForSurfaces is a no-op', async () => {
    const recomputeSpy = vi.spyOn(generalCostMonthsRepo, 'persistGeneralCostMonthRecompute');
    await refreshAllOpenGeneralCostMonthsForSurfaces(context);
    expect(recomputeSpy).not.toHaveBeenCalled();
    recomputeSpy.mockRestore();
  });

  it('refreshCurrentOpenGeneralCostMonthsForSurfaces is a no-op', async () => {
    const recomputeSpy = vi.spyOn(recomputeModule, 'recomputeGeneralCostMonth');
    await refreshCurrentOpenGeneralCostMonthForSurfaces(context);
    expect(recomputeSpy).not.toHaveBeenCalled();
    recomputeSpy.mockRestore();
  });

  it('recomputeGeneralCostMonth skips future economic periods without persisting', async () => {
    vi.spyOn(generalCostMonthsRepo, 'findGeneralCostMonth').mockResolvedValue(null);
    const persistSpy = vi
      .spyOn(generalCostMonthsRepo, 'persistGeneralCostMonthRecompute')
      .mockResolvedValue(undefined as never);

    const result = await recomputeGeneralCostMonth(context, '2026-12');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('future_economic_period');
    expect(persistSpy).not.toHaveBeenCalled();

    persistSpy.mockRestore();
    vi.restoreAllMocks();
  });
});
