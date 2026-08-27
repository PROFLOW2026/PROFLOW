import { describe, expect, it } from 'vitest';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import {
  assertInternalPayrollExpenseAllowed,
  isInternalEmployeePayrollCategoryKey,
  isLaborCostCategoryKey,
  shouldExcludeLaborExpenseForWorkforce,
} from '@/modules/financials/domain/labor-expense-integrity';
import { money } from '@/shared/money';

const ILS = 'ILS';

describe('labor expense vs time-entry integrity', () => {
  it('recognizes legacy labor vs internal payroll keys', () => {
    expect(isLaborCostCategoryKey('labor')).toBe(true);
    expect(isLaborCostCategoryKey('LABOR')).toBe(true);
    expect(isLaborCostCategoryKey('materials')).toBe(false);
    expect(isLaborCostCategoryKey('internal_employee_payroll')).toBe(false);

    expect(isInternalEmployeePayrollCategoryKey('internal_employee_payroll')).toBe(true);
    expect(isInternalEmployeePayrollCategoryKey('INTERNAL_EMPLOYEE_PAYROLL')).toBe(true);
    expect(isInternalEmployeePayrollCategoryKey('labor')).toBe(false);
  });

  it('always excludes internal payroll from Actual; never excludes generic labor', () => {
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: true,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(true);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'internal_employee_payroll',
        projectId: 'p1',
        hasWorkforceData: false,
      }),
    ).toBe(true);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        isLaborCategory: false,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'labor',
        isLaborCategory: true,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);
  });

  it('blocks internal payroll on ordinary Expense path', () => {
    expect(() =>
      assertInternalPayrollExpenseAllowed({ categoryKey: 'internal_employee_payroll' }),
    ).toThrow(/not allowed/i);

    expect(() =>
      assertInternalPayrollExpenseAllowed({ categoryKey: 'labor' }),
    ).not.toThrow();
  });

  it('does not double-count internal payroll expense when time True Cost is present', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: true,
          categoryKey: 'internal_employee_payroll',
        },
        {
          amount: '500.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: false,
        },
      ],
      {
        laborCost: money('3000', ILS),
        hasWorkforceData: true,
      },
      ILS,
    );

    expect(cost.actualCostToDate).toEqual(money('3500', ILS));
    expect(cost.laborActual).toEqual(money('3000', ILS));
    expect(partials).toContainEqual({
      reason: 'labor_category_excluded_for_workforce',
      count: 1,
    });
  });

  it('keeps generic labor expense in Actual when workforce data is present', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: false,
          categoryKey: 'labor',
        },
      ],
      {
        laborCost: money('3000', ILS),
        hasWorkforceData: true,
      },
      ILS,
    );

    expect(cost.actualCostToDate).toEqual(money('11000', ILS));
    expect(partials).not.toContainEqual({
      reason: 'labor_category_excluded_for_workforce',
      count: 1,
    });
  });

  it('excludes restricted internal payroll even when workforce data is absent', () => {
    const { cost, partials } = aggregateProjectCosts(
      [
        {
          amount: '8000.00',
          currency: ILS,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          isLaborCategory: true,
          categoryKey: 'internal_employee_payroll',
        },
      ],
      null,
      ILS,
    );

    expect(cost.actualCostToDate).toEqual(money('0', ILS));
    expect(partials).toContainEqual({
      reason: 'labor_category_excluded_for_workforce',
      count: 1,
    });
  });
});
