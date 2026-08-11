import { describe, expect, it } from 'vitest';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import {
  explainMonthCloseAdjustments,
  isEconomicAdjustment,
  netEconomicAdjustments,
  supersededAdjustmentIds,
} from '@/modules/month-close/domain/economic-corrections';
import type { MonthCloseAdjustment } from '@/modules/month-close/domain/types';
import { createAdjustmentSchema } from '@/modules/month-close/validation/schemas';
import { money, zeroMoney } from '@/shared/money';

const PERIOD = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function row(
  partial: Partial<MonthCloseAdjustment> & Pick<MonthCloseAdjustment, 'id'>,
): MonthCloseAdjustment {
  return {
    organizationId: 'org',
    periodId: PERIOD,
    adjustmentType: 'correction',
    reason: 'note',
    entityType: null,
    entityId: null,
    amount: null,
    currency: null,
    effectSide: null,
    projectId: null,
    projectName: null,
    supersedesAdjustmentId: null,
    createdByUserId: null,
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
    updatedAt: new Date('2026-02-01T00:00:00.000Z'),
    ...partial,
  };
}

describe('createAdjustmentSchema', () => {
  it('accepts audit-only rows with amount omitted', () => {
    const parsed = createAdjustmentSchema.safeParse({
      periodId: PERIOD,
      reason: 'Documented after close',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.amount ?? null).toBeNull();
      expect(parsed.data.currency ?? null).toBeNull();
      expect(parsed.data.effectSide ?? null).toBeNull();
    }
  });

  it('requires currency, effectSide, and projectId when amount is provided', () => {
    const parsed = createAdjustmentSchema.safeParse({
      periodId: PERIOD,
      reason: 'Missed cost',
      amount: '100.00',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const paths = parsed.error.issues.map((issue) => issue.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['currency', 'effectSide', 'projectId']));
    }
  });

  it('accepts a complete economic correction', () => {
    const parsed = createAdjustmentSchema.safeParse({
      periodId: PERIOD,
      reason: 'Missed cost',
      amount: '-25.5',
      currency: 'ils',
      effectSide: 'cost',
      projectId: PROJECT,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.currency).toBe('ILS');
      expect(parsed.data.effectSide).toBe('cost');
    }
  });

  it('requires a target when type is supersede', () => {
    const parsed = createAdjustmentSchema.safeParse({
      periodId: PERIOD,
      adjustmentType: 'supersede',
      reason: 'Replace',
      amount: '40',
      currency: 'ILS',
      effectSide: 'cost',
      projectId: PROJECT,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('economic correction netting', () => {
  const rows: MonthCloseAdjustment[] = [
    row({
      id: A,
      amount: '100.00',
      currency: 'ILS',
      effectSide: 'cost',
      projectId: PROJECT,
      projectName: 'Site',
    }),
    row({
      id: B,
      adjustmentType: 'supersede',
      amount: '40.00',
      currency: 'ILS',
      effectSide: 'cost',
      projectId: PROJECT,
      projectName: 'Site',
      supersedesAdjustmentId: A,
    }),
    row({
      id: C,
      amount: '25.00',
      currency: 'ILS',
      effectSide: 'revenue',
      projectId: PROJECT,
      projectName: 'Site',
    }),
    row({
      id: D,
      reason: 'Audit only — no money',
    }),
  ];

  it('treats amount-null rows as audit-only', () => {
    expect(isEconomicAdjustment(rows[0]!)).toBe(true);
    expect(isEconomicAdjustment(rows[3]!)).toBe(false);
  });

  it('excludes superseded rows so money folds once', () => {
    expect(supersededAdjustmentIds(rows).has(A)).toBe(true);
    expect(supersededAdjustmentIds(rows).has(B)).toBe(false);

    const net = netEconomicAdjustments(rows, { currency: 'ILS', projectId: PROJECT });
    expect(net.costNet).toEqual(money('40', 'ILS'));
    expect(net.revenueNet).toEqual(money('25', 'ILS'));
  });

  it('explains original vs correction without inventing Actual', () => {
    const explained = explainMonthCloseAdjustments(rows);
    const original = explained.find((item) => item.adjustment.id === A);
    const replacement = explained.find((item) => item.adjustment.id === B);
    const audit = explained.find((item) => item.adjustment.id === D);

    expect(original?.isSuperseded).toBe(true);
    expect(original?.correctionAmount).toEqual(money('100', 'ILS'));
    expect(replacement?.originalAmount).toEqual(money('100', 'ILS'));
    expect(replacement?.correctionAmount).toEqual(money('40', 'ILS'));
    expect(replacement?.isSuperseded).toBe(false);
    expect(audit?.isEconomic).toBe(false);
    expect(audit?.correctionAmount).toBeNull();
  });

  it('passes the surviving net into compose once (not a second Actual engine)', () => {
    const net = netEconomicAdjustments(rows, { currency: 'ILS', projectId: PROJECT });
    const composed = composeProjectFinancials({
      projectId: PROJECT,
      currency: 'ILS',
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: true,
      canReadProfit: false,
      commercialData: null,
      billingRows: { currency: 'ILS', records: [] },
      expenseContributions: [
        {
          amount: '200.00',
          currency: 'ILS',
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: PROJECT,
          expenseId: 'e1',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
      monthCloseEconomic: net,
    });

    // Expense 200 + surviving cost correction 40 (100 superseded) = 240 once.
    expect(composed.cost.actualCostToDate.amount).toBe('240.000000');
    expect(composed.cost.byFamily.directProject.amount).toBe('200.000000');
    expect(composed.cost.monthCloseCostNet.amount).toBe('40.000000');
    expect(composed.billing.invoiced.amount).toBe('25.000000');
    expect(composed.billing.outstanding.amount).toBe('25.000000');
    expect(composed.billing.paid).toEqual(zeroMoney('ILS'));
  });
});
