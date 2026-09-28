import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { money } from '@/shared/money';
import { previewAllocationFromPreparedInputs } from '@/modules/financials/application/preview-general-cost-month';
import { recomputeGeneralCostMonth } from '@/modules/financials/application/recompute-general-cost-month';
import * as generalCostMonthsRepo from '@/modules/financials/data/general-cost-months.repository';
import * as monthClose from '@/modules/month-close';

const ILS = 'ILS';

const context = {
  organizationId: 'org-1',
  organization: { timezone: 'Asia/Jerusalem', baseCurrency: ILS },
  permissions: new Set([
    PERMISSIONS.PROJECT_FINANCIALS_READ,
    PERMISSIONS.EXPENSES_READ,
    PERMISSIONS.WORKFORCE_READ,
    PERMISSIONS.AP_READ,
  ]),
  db: {},
} as unknown as OrgContext;

describe('GCM monthly Direct Actual weight basis', () => {
  it('allocates by same-month basis only, not cumulative history', () => {
    const pool = money('1000', ILS);
    const monthlyBases = [
      { projectId: 'active-this-month', directActual: money('8000', ILS) },
      { projectId: 'idle-this-month', directActual: money('0', ILS) },
    ];
    const cumulativeBases = [
      { projectId: 'active-this-month', directActual: money('200000', ILS) },
      { projectId: 'idle-this-month', directActual: money('180000', ILS) },
    ];

    const monthlyPreview = previewAllocationFromPreparedInputs({
      yearMonth: '2026-09',
      currency: ILS,
      timezone: 'Asia/Jerusalem',
      allowFuture: false,
      existing: null,
      monthClosed: false,
      sources: [{ kind: 'expense_unallocated', amount: pool, label: 'expense_unallocated' }],
      bases: monthlyBases,
    });
    const cumulativePreview = previewAllocationFromPreparedInputs({
      yearMonth: '2026-09',
      currency: ILS,
      timezone: 'Asia/Jerusalem',
      allowFuture: false,
      existing: null,
      monthClosed: false,
      sources: [{ kind: 'expense_unallocated', amount: pool, label: 'expense_unallocated' }],
      bases: cumulativeBases,
    });

    const monthlyActive = monthlyPreview.lines.find((l) => l.projectId === 'active-this-month');
    const cumulativeActive = cumulativePreview.lines.find((l) => l.projectId === 'active-this-month');
    expect(Number(monthlyActive?.amount.amount)).toBeCloseTo(1000, 2);
    expect(Number(cumulativeActive?.amount.amount)).toBeCloseTo(526.32, 1);
    expect(monthlyPreview.lines.some((l) => l.projectId === 'idle-this-month')).toBe(false);
  });

  it('reconciles allocated auto_pool lines to distributable pool', () => {
    const pool = money('6920.03', ILS);
    const bases = [
      { projectId: 'a', directActual: money('4000', ILS) },
      { projectId: 'b', directActual: money('6000', ILS) },
    ];
    const preview = previewAllocationFromPreparedInputs({
      yearMonth: '2026-09',
      currency: ILS,
      timezone: 'Asia/Jerusalem',
      allowFuture: false,
      existing: null,
      monthClosed: false,
      sources: [{ kind: 'expense_unallocated', amount: pool, label: 'expense_unallocated' }],
      bases,
    });
    const allocated = preview.lines.reduce((sum, line) => sum + Number(line.amount.amount), 0);
    expect(allocated).toBeCloseTo(Number(pool.amount), 2);
  });

  it('recomputes frozen months with allowFrozenReplace', async () => {
    vi.spyOn(monthClose, 'isMonthClosed').mockResolvedValue(true);
    vi.spyOn(generalCostMonthsRepo, 'findGeneralCostMonth').mockResolvedValue({
      id: 'gcm-1',
      organizationId: 'org-1',
      yearMonth: '2026-01',
      currency: ILS,
      poolAmount: '100',
      allocatedAmount: '50',
      unallocatableAmount: '50',
      basisMode: 'direct_actual_weight',
      status: 'frozen',
      computedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      frozenAt: new Date(),
    });
    const persistSpy = vi
      .spyOn(generalCostMonthsRepo, 'persistGeneralCostMonthRecompute')
      .mockResolvedValue(undefined as never);

    vi.spyOn(await import('@/modules/financials/data/expenses.repository'), 'sumUnallocatedExpensesForMonth').mockResolvedValue(
      money('0', ILS),
    );
    vi.spyOn(await import('@/modules/financials/data/expenses.repository'), 'sumCompanyOnlyExpensesForMonth').mockResolvedValue(
      money('0', ILS),
    );
    vi.spyOn(await import('@/modules/workforce'), 'sumOrganizationMonthlyLaborUnallocated').mockResolvedValue({
      totalAmount: '0',
      currency: ILS,
    });
    vi.spyOn(await import('@/modules/workforce'), 'sumOrganizationMonthlyLaborCompanyOnly').mockResolvedValue({
      totalAmount: '0',
      currency: ILS,
    });
    vi.spyOn(await import('@/modules/workforce'), 'sumOrganizationNonProjectLaborCost').mockResolvedValue({
      totalAmount: '0',
      currency: ILS,
      entryCount: 0,
      entriesMissingCost: 0,
    });
    vi.spyOn(await import('@/modules/ap'), 'sumRecognizedApGeneralRemainders').mockResolvedValue({
      remainderFromUnderAllocatedBills: money('0', ILS),
      remainderFromUnderAllocatedBillsCompanyOnly: money('0', ILS),
      remainderFromNullProjectBills: money('0', ILS),
      totalGeneralRemainder: money('0', ILS),
    });
    vi.spyOn(
      await import('@/modules/financials/data/inventory-consumptions.repository'),
      'sumInventoryWriteoffsForMonth',
    ).mockResolvedValue(money('0', ILS));
    vi.spyOn(
      await import('@/modules/financials/application/load-direct-actual-basis-by-project'),
      'loadDirectActualBasisByProject',
    ).mockResolvedValue([]);

    Object.assign(context.db, {
      select: () => ({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    });

    const result = await recomputeGeneralCostMonth(context, '2026-01');
    expect(result.skipped).toBe(false);
    expect(persistSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ allowFrozenReplace: true, yearMonth: '2026-01' }),
    );

    vi.restoreAllMocks();
  });
});
