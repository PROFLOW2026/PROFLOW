import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { costCategories } from '@drizzle/schema';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { confirmExpensePaid } from '@/modules/expenses/application/expense-payments';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { loadProjectExpenseContributions } from '@/modules/financials/data/expenses.repository';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  applyGateAFinancialIntegrationMigrations,
  createProjectWithDefaultPackage,
} from '@tests/setup/financial-integration-pglite';
import { businessDate } from '@/shared/dates';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

const ILS = 'ILS';

async function provisionTenant(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) =>
    createOrganization(db, owner.id, { name, countryCode: 'IL' }),
  );
}

describe('F01 — installment expense project actual (PGlite)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let materialsCategoryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyGateAFinancialIntegrationMigrations(database);
    await seedSystem(database);

    owner = await createTestUser(database, 'f01-installment-owner@test.local');
    const org = await provisionTenant(database, owner, 'F01 Installment Org');
    orgId = org.organization.id;

    const categoryRows = await database.asService(async (db) =>
      db
        .select({ id: costCategories.id, key: costCategories.key })
        .from(costCategories)
        .where(eq(costCategories.organizationId, orgId)),
    );
    materialsCategoryId = categoryRows.find((row) => row.key === 'materials')!.id;
  });

  afterAll(async () => {
    await database.close();
  });

  it('90,000 NET in 9 installments with no verified payment → actualCostToDate 0', async () => {
    const projectId = await createProjectWithDefaultPackage(
      database,
      owner.id,
      orgId,
      'F01 unpaid installments',
    );

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });

      const draft = await createExpense(context, {
        netAmount: '90000',
        amount: '90000',
        currency: ILS,
        vatMode: 'zero',
        description: 'Nine-month materials',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 9,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      const contributions = await loadProjectExpenseContributions(tx, orgId, projectId);
      const { cost } = aggregateProjectCosts(contributions, null, ILS);
      expect(cost.actualCostToDate.amount).toBe('0.000000');

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('0.000000');
    });
  });

  it('after first installment payment confirmed → actualCostToDate 10,000 NET', async () => {
    const projectId = await createProjectWithDefaultPackage(
      database,
      owner.id,
      orgId,
      'F01 first payment',
    );

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });

      const draft = await createExpense(context, {
        netAmount: '90000',
        amount: '106200',
        currency: ILS,
        vatMode: 'exclusive',
        description: 'Nine-month with VAT',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-01-01',
        installmentCount: 9,
        installmentStartDate: '2026-01-01',
      });
      await finalizeExpense(context, draft.id);

      await confirmExpensePaid(context, draft.id, {
        paidAt: businessDate('2026-03-15'),
        paidGrossAmount: '11800.000000',
      });

      const contributions = await loadProjectExpenseContributions(tx, orgId, projectId);
      const { cost } = aggregateProjectCosts(contributions, null, ILS);
      expect(cost.actualCostToDate.amount).toBe('10000.000000');

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('10000.000000');
    });
  });
});
