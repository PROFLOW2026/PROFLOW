import { describe, expect, it } from 'vitest';
import { emptyCostPosition, withCommittedAndApPayable } from '@/modules/financials/domain/cost-aggregation';
import { money, zeroMoney } from '@/shared/money';
import {
  composeBudgetControlPosition,
  computeBudgetVariance,
} from '@/modules/budgets/domain/variance';
import { resolveBudgetMode } from '@/modules/budgets/domain/types';

const ILS = 'ILS';

describe('budget variance math', () => {
  it('computes variance as Budget − Forecast (favorable when positive)', () => {
    const variance = computeBudgetVariance(money('100000', ILS), money('92000', ILS));
    expect(variance).toEqual(money('8000', ILS));
  });

  it('composes control totals from budget + shared engine cost (no separate Actual)', () => {
    const cost = withCommittedAndApPayable(
      {
        ...emptyCostPosition(ILS),
        actualCostToDate: money('50000', ILS),
        estimatedFinalCost: money('50000', ILS),
      },
      money('20000', ILS),
      zeroMoney(ILS),
      money('10000', ILS),
    );

    const control = composeBudgetControlPosition({
      budgetAmount: '100000',
      currency: ILS,
      cost,
    });

    expect(control.budget).toEqual(money('100000', ILS));
    expect(control.actual).toEqual(money('50000', ILS));
    expect(control.remainingCommitment).toEqual(money('20000', ILS));
    expect(control.etc).toEqual(money('10000', ILS));
    expect(control.forecast).toEqual(money('80000', ILS));
    expect(control.variance).toEqual(money('20000', ILS));
  });

  it('keeps forecast equal to actual when commitment and ETC are zero', () => {
    const cost = withCommittedAndApPayable(
      {
        ...emptyCostPosition(ILS),
        actualCostToDate: money('40000', ILS),
        estimatedFinalCost: money('40000', ILS),
      },
      zeroMoney(ILS),
      zeroMoney(ILS),
      zeroMoney(ILS),
    );

    const control = composeBudgetControlPosition({
      budgetAmount: money('55000', ILS),
      currency: ILS,
      cost,
    });

    expect(control.forecast).toEqual(control.actual);
    expect(control.variance).toEqual(money('15000', ILS));
  });

  it('shows over-budget variance as negative when forecast exceeds budget', () => {
    const cost = withCommittedAndApPayable(
      {
        ...emptyCostPosition(ILS),
        actualCostToDate: money('70000', ILS),
        estimatedFinalCost: money('70000', ILS),
      },
      money('30000', ILS),
      zeroMoney(ILS),
      money('10000', ILS),
    );

    const control = composeBudgetControlPosition({
      budgetAmount: '100000',
      currency: ILS,
      cost,
    });

    expect(control.forecast).toEqual(money('110000', ILS));
    expect(control.variance).toEqual(money('-10000', ILS));
  });

  it('without engine cost, Actual/Forecast stay zero and variance equals budget', () => {
    const control = composeBudgetControlPosition({
      budgetAmount: '25000',
      currency: ILS,
      cost: null,
    });
    expect(control.actual).toEqual(zeroMoney(ILS));
    expect(control.forecast).toEqual(zeroMoney(ILS));
    expect(control.variance).toEqual(money('25000', ILS));
  });
});

describe('budget mode', () => {
  it('treats a single total line as lightweight', () => {
    expect(
      resolveBudgetMode([
        {
          id: '1',
          organizationId: 'o',
          budgetId: 'b',
          revisionNumber: 1,
          lineType: 'total',
          categoryKey: null,
          workPackageId: null,
          disciplineKey: null,
          costCode: null,
          costCodeId: null,
          label: 'Total',
          budgetAmount: '100',
          etcAmount: null,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ).toBe('lightweight');
  });

  it('treats category lines as advanced', () => {
    expect(
      resolveBudgetMode([
        {
          id: '1',
          organizationId: 'o',
          budgetId: 'b',
          revisionNumber: 1,
          lineType: 'category',
          categoryKey: 'labor',
          workPackageId: null,
          disciplineKey: null,
          costCode: null,
          costCodeId: null,
          label: 'Labor',
          budgetAmount: '40',
          etcAmount: null,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    ).toBe('advanced');
  });
});
