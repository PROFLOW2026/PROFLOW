import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  approveChangeRequest,
  createChangeRequest,
  submitChangeRequestForApproval,
} from '@/modules/commercial';
import { listProjectBillingRecords } from '@/modules/billing';
import { createExpense, finalizeExpense, listExpensesForOrg } from '@/modules/expenses';
import { getProjectFinancials } from '@/modules/financials';
import {
  createProject,
  getProjectDetail,
  updateProject,
} from '@/modules/projects';
import { resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from './setup';

describe('project entry baseline (opening reduction)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
  });

  it('Scenario A: display 200k − reduction 150k ⇒ managed 50k; expense/CO math; no fake 150k cash rows', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const created = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const { projectId } = await createProject(context, {
        name: 'Mid-project entry A',
        contractValueAmount: '200000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
        openingReductionAmount: '150000',
      });
      return getProjectDetail(context, projectId);
    });

    expect(created.contract?.displayOriginalEnteredAmount).toBe('200000.000000');
    expect(created.contract?.displayOriginalNetAmount).toBe('200000.000000');
    expect(created.contract?.openingReductionEnteredAmount).toBe('150000.000000');
    expect(created.contract?.openingReductionNetAmount).toBe('150000.000000');
    expect(created.contract?.originalValueAmount).toBe('50000.000000');
    expect(created.contract?.enteredValueAmount).toBe('50000.000000');
    expect(created.currentContractValue?.amount).toBe('50000.000000');
    expect(created.contractValueEvents.filter((e) => e.kind === 'original')).toHaveLength(1);
    expect(created.contractValueEvents[0]?.amount).toBe('50000.000000');

    const afterExpense = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const expense = await createExpense(context, {
        amount: '10000',
        currency: 'ILS',
        projectId: created.project.id,
        description: 'Managed-period materials',
      });
      await finalizeExpense(context, expense.id);
      return getProjectFinancials(context, created.project.id);
    });

    expect(afterExpense.commercial?.currentContractValue.amount).toBe('50000.000000');
    expect(afterExpense.commercial?.originalContractValue.amount).toBe('50000.000000');
    expect(afterExpense.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(afterExpense.profit?.actualProfit.amount).toBe('40000.000000');

    const afterChange = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const change = await createChangeRequest(context, {
        projectId: created.project.id,
        title: 'Approved addition',
        direction: 'addition',
        requestedAmount: '20000',
      });
      await submitChangeRequestForApproval(context, change.changeRequestId);
      await approveChangeRequest(context, {
        changeRequestId: change.changeRequestId,
        effectiveDate: '2026-08-01',
      });
      return {
        detail: await getProjectDetail(context, created.project.id),
        financials: await getProjectFinancials(context, created.project.id),
        expenses: await listExpensesForOrg(context, {
          projectId: created.project.id,
          limit: 100,
        }),
        billing: await listProjectBillingRecords(context, created.project.id),
      };
    });

    expect(afterChange.detail.currentContractValue?.amount).toBe('70000.000000');
    expect(afterChange.detail.originalContractAmountLocked).toBe(true);
    expect(afterChange.financials.commercial?.currentContractValue.amount).toBe('70000.000000');
    expect(afterChange.financials.profit?.actualProfit.amount).toBe('60000.000000');

    // Opening reduction must not invent payment / billing / expense rows.
    expect(afterChange.expenses.items).toHaveLength(1);
    expect(afterChange.expenses.items[0]?.grossAmount.amount).toBe('10000.000000');
    expect(
      afterChange.expenses.items.some((row) => row.grossAmount.amount === '150000.000000'),
    ).toBe(false);
    expect(afterChange.billing).toHaveLength(0);

    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      await expect(
        updateProject(context, {
          projectId: created.project.id,
          contractValueAmount: '200000',
          contractValueCurrency: 'ILS',
          amountIncludesTax: false,
          openingReductionAmount: '100000',
        }),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });

  it('Scenario B: reduction 0 matches today’s contract storage', async () => {
    const { orgA, userA } = await provisionTwoTenants(database);

    const [withZero, without] = await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgA.organization.id,
        locale: 'he-IL',
      });
      const a = await createProject(context, {
        name: 'Baseline B zero',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
        openingReductionAmount: '0',
      });
      const b = await createProject(context, {
        name: 'Baseline B omitted',
        contractValueAmount: '100000',
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
      });
      return Promise.all([
        getProjectDetail(context, a.projectId),
        getProjectDetail(context, b.projectId),
      ]);
    });

    for (const detail of [withZero, without]) {
      expect(detail.contract?.displayOriginalNetAmount).toBeNull();
      expect(detail.contract?.openingReductionNetAmount).toBeNull();
      expect(detail.contract?.enteredValueAmount).toBe('100000.000000');
      expect(detail.contract?.originalValueAmount).toBe('100000.000000');
      expect(detail.currentContractValue?.amount).toBe('100000.000000');
    }

    expect(withZero.contract?.originalValueAmount).toBe(without.contract?.originalValueAmount);
    expect(withZero.contract?.taxSnapshot?.netAmount).toBe(without.contract?.taxSnapshot?.netAmount);
  });
});
