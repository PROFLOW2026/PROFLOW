/**
 * AGENT 8 — financial integration regressions (workforce ↔ compose ↔ expense/AP).
 * Extends domain tests only; does not duplicate attendance-project-sync / expense-ap-dedup impl.
 */
import { describe, expect, it, vi } from 'vitest';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import type { ProjectExpenseContribution } from '@/modules/financials/domain/cost-aggregation';
import { mapFinancialsToWarningInput } from '@/modules/forecast/application/map-financials-to-warning-input';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import { emptyCostPosition, withAllocatedGeneralBusinessCost } from '@/modules/financials/domain/cost-aggregation';
import {
  displacedEmployeeMonthKey,
  isTimeEntryDisplacedByMonth,
  mergeResidualTimeAndMonthlyAllocatedLabor,
} from '@/modules/workforce/domain/labor-recognition';
import { contributesLaborActual } from '@/modules/workforce/domain/timesheet-lifecycle';
import { assertCanApproveSubmittedTimeEntries } from '@/modules/workforce/application/scoped-operational-approval';
import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

vi.mock('@/modules/project-team', () => ({
  hasProjectCapability: vi.fn(async () => true),
  isOrgProjectAdmin: vi.fn(() => false),
  expandCapabilities: vi.fn(),
  listActiveMembershipsForUser: vi.fn(async () => []),
  PROJECT_CAPABILITIES: { OPERATIONAL_APPROVE: 'operational.approve' },
}));
import { addMoney, money, moneyEquals, zeroMoney } from '@/shared/money';
import type { ProjectFinancials } from '@/modules/financials/domain/types';

const ILS = 'ILS';

function expenseLine(
  expenseId: string,
  amount: string,
): ProjectExpenseContribution {
  return {
    amount,
    currency: ILS,
    costFamily: 'direct_project',
    isDirectOnProject: true,
    isAllocated: false,
    isSubcontractor: false,
    projectId: 'p1',
    expenseId,
  };
}

describe('AGENT 8 — manager-approved time → labor Actual in compose', () => {
  const laborCost = money('5400', ILS);

  it('gates labor Actual on recorded + approved (pending sync rows stay out of compose)', () => {
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'approved' })).toBe(true);
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'draft' })).toBe(false);
    expect(contributesLaborActual({ status: 'recorded', approvalStatus: 'submitted' })).toBe(false);

    const withoutApprovedLabor = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: true,
      commercialData: null,
      billingRows: null,
      expenseContributions: [],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });
    expect(withoutApprovedLabor.cost.laborActual.amount).toBe('0.000000');

    const withApprovedLabor = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: true,
      commercialData: null,
      billingRows: null,
      expenseContributions: [],
      laborInput: { laborCost, hasWorkforceData: true, entriesMissingCost: 0 },
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });
    expect(withApprovedLabor.cost.laborActual).toEqual(laborCost);
    expect(withApprovedLabor.cost.actualCostToDate).toEqual(laborCost);
  });
});

describe('AGENT 8 — V09-002 14k partial match geometry (compose contract)', () => {
  it('expense 10k + bill 10k + match 6k caps vendor at match — Actual stays 10k (not 14k)', () => {
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [expenseLine('linked-expense', '10000')],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: {
        billAmounts: ['10000'],
        total: money('10000', ILS),
        linkedExpenseDeductions: new Map([['linked-expense', '6000']]),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
        recognizedBillIds: ['bill-1'],
        billMatchLinks: [
          { billId: 'bill-1', expenseId: 'linked-expense', matchedAmount: '6000' },
        ],
      },
    });

    expect(result.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(result.cost.vendorActual.amount).toBe('6000.000000');
    expect(result.cost.actualCostToDate.amount).not.toBe('14000.000000');
  });
});

describe('AGENT 8 — labor displacement (no double Actual)', () => {
  it('uses monthly allocation only when employee-month is displaced', () => {
    const employeeId = 'emp-a';
    const displaced = new Set([displacedEmployeeMonthKey(employeeId, '2026-03')]);
    const entryCost = money('18000', ILS);
    const displacedEntry = isTimeEntryDisplacedByMonth(employeeId, '2026-03-12', displaced);
    expect(displacedEntry).toBe(true);

    const residual = displacedEntry ? zeroMoney(ILS) : entryCost;
    const laborCost = mergeResidualTimeAndMonthlyAllocatedLabor({
      residualTimeLabor: residual,
      monthlyAllocatedLabor: money('20000', ILS),
    });
    expect(moneyEquals(laborCost, money('20000', ILS))).toBe(true);
    expect(moneyEquals(addMoney(entryCost, money('20000', ILS)), money('38000', ILS))).toBe(true);
    expect(moneyEquals(laborCost, money('38000', ILS))).toBe(false);
  });
});

describe('AGENT 8 — scoped operational approval queue rules', () => {
  it('rejects bulk approve spanning multiple projects for scoped approvers', async () => {
    const context = {
      organizationId: 'org-1',
      userId: 'user-1',
      permissions: new Set<string>(),
      db: {},
    } as unknown as OrgContext;

    await expect(
      assertCanApproveSubmittedTimeEntries(context, [
        {
          kind: 'project',
          projectId: 'project-a',
          employeeId: 'e1',
          approvalStatus: 'submitted',
          createdByUserId: null,
        },
        {
          kind: 'project',
          projectId: 'project-b',
          employeeId: 'e1',
          approvalStatus: 'submitted',
          createdByUserId: null,
        },
      ]),
    ).rejects.toBeInstanceOf(DomainRuleError);

    expect(context.permissions.has(PERMISSIONS.TIME_APPROVE)).toBe(false);
  });
});

describe('AGENT 8 — F11 warning input matches compose forecast basis', () => {
  function buildIncludeGeneralFinancials(): ProjectFinancials {
    let cost = emptyCostPosition(ILS);
    const directActual = money('60000', ILS);
    cost = {
      ...cost,
      actualCostToDate: directActual,
      directActualCostToDate: directActual,
      estimatedFinalCost: directActual,
    };
    cost = withAllocatedGeneralBusinessCost(cost, money('10000', ILS));
    const directForecast = money('60000', ILS);
    const fullForecast = money('70000', ILS);
    cost = {
      ...cost,
      fullActualCostToDate: fullForecast,
      directForecastFinalCost: directForecast,
      fullForecastFinalCost: fullForecast,
      estimatedFinalCost: directForecast,
    };

    const zero = zeroMoney(ILS);
    return {
      projectId: 'p1',
      currency: ILS,
      workKind: 'project',
      pricingMode: 'fixed',
      priceNotSet: false,
      projectProfitabilityMode: 'include_general',
      commercial: {
        originalContractValue: money('80000', ILS),
        approvedAdditions: zero,
        approvedReductions: zero,
        currentContractValue: money('80000', ILS),
        pendingChanges: zero,
      },
      profit: {
        estimatedProfit: money('10000', ILS),
        marginPercent: '12.50',
        actualProfit: money('10000', ILS),
        actualMarginPercent: '12.50',
      },
      sliceAvailability: buildSliceAvailability({
        canReadCommercial: true,
        canReadBilling: true,
        canReadExpenses: true,
        canReadWorkforce: true,
        canReadProcurement: true,
        canReadAp: true,
        laborLoaded: true,
      }),
      cost,
      billing: {
        invoiced: zeroMoney(ILS),
        netInvoiced: zeroMoney(ILS),
        paid: zeroMoney(ILS),
        netPaid: zeroMoney(ILS),
        outstanding: zeroMoney(ILS),
        netOutstanding: zeroMoney(ILS),
        monthCloseRevenueNet: zeroMoney(ILS),
        hasBillingData: false,
      },
      dataConfidence: { level: 'high', reasons: [] },
      coverage: buildFinancialCoverage(
        [{ source: 'direct_expenses', hasData: true }],
        new Date('2026-01-01T00:00:00Z'),
      ),
    };
  }

  it('mapFinancialsToWarningInput uses full forecast when mode is include_general', () => {
    const financials = buildIncludeGeneralFinancials();
    const warningInput = mapFinancialsToWarningInput({
      financials,
      budgetAmount: '65000',
      progressPercent: '40',
      canReadBudget: true,
      canReadBilling: true,
      canReadProfit: true,
    });
    expect(warningInput.forecastFinalCostAmount).toBe(
      financials.cost.fullForecastFinalCost!.amount,
    );
    expect(warningInput.forecastFinalCostAmount).not.toBe(financials.cost.estimatedFinalCost.amount);
  });
});
