import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employees,
  expenses,
  inventoryItems,
  laborAllocationRunLines,
  laborAllocationRuns,
} from '@drizzle/schema';
import {
  acceptApMatch,
  createApBill,
  createVendorCredit,
  postVendorCredit,
  applyVendorCredit,
  proposeApMatch,
} from '@/modules/ap';
import { createExpense } from '@/modules/expenses/application/create-expense';
import { finalizeExpense } from '@/modules/expenses/application/finalize-expense';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import {
  listOrganizationRecognizedCostBreakdownInDateRange,
  listOrganizationUndatedOpenApBillDisclosures,
  sumOrganizationRecognizedCostPairInDateRange,
} from '@/modules/financials/data/expenses.repository';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { createVendor } from '@/modules/vendors';
import { businessDate } from '@/shared/dates';
import {
  classifyApBillLines,
  findCostCategoryId,
  insertRecognizedApBill,
} from '@tests/setup/cost-category-fixtures';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  applyGateAFinancialIntegrationMigrations,
  createProjectWithDefaultPackage,
} from '@tests/setup/financial-integration-pglite';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

const ILS = 'ILS';
const MARCH = businessDate('2026-03-01');
const MARCH_END = businessDate('2026-03-31');

async function provisionOrg(database: TestDatabase, owner: TestUser) {
  return database.asService(async (db) =>
    createOrganization(db, owner.id, { name: 'F03 reconciliation org', countryCode: 'IL' }),
  );
}

async function seedAppliedEmployeeMonthCost(
  database: TestDatabase,
  input: {
    organizationId: string;
    employeeId: string;
    yearMonth: string;
    knownAmount: string;
    projectId: string;
  },
) {
  const monthId = randomUUID();
  const runId = randomUUID();
  await database.asService(async (db) => {
    await db.insert(employeeMonthCosts).values({
      id: monthId,
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      yearMonth: input.yearMonth,
      currency: ILS,
      estimatedAmount: input.knownAmount,
      knownAmount: input.knownAmount,
      knownQuality: 'estimated',
      recognitionSource: 'time_snapshot',
      status: 'draft',
    });
    await db.insert(laborAllocationRuns).values({
      id: runId,
      organizationId: input.organizationId,
      employeeMonthCostId: monthId,
      method: 'fixed_amount',
      status: 'draft',
      currency: ILS,
      allocatedAmount: input.knownAmount,
      unallocatedAmount: '0',
    });
    await db.insert(laborAllocationRunLines).values({
      organizationId: input.organizationId,
      laborAllocationRunId: runId,
      projectId: input.projectId,
      amount: input.knownAmount,
      currency: ILS,
      sortOrder: 0,
    });
    await db
      .update(laborAllocationRuns)
      .set({ status: 'applied', appliedAt: new Date() })
      .where(eq(laborAllocationRuns.id, runId));
  });
}

describe('F03 monthly vs project reconciliation (PGlite)', () => {
  let database: TestDatabase;
  let owner: TestUser;
  let orgId: string;
  let materialsCategoryId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await applyGateAFinancialIntegrationMigrations(database);
    await seedSystem(database);
    owner = await createTestUser(database, 'f03-monthly-owner@test.local');
    const org = await provisionOrg(database, owner);
    orgId = org.organization.id;
  }, 120_000);

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
    owner = await createTestUser(database, `f03-monthly-${randomUUID()}@test.local`);
    const org = await provisionOrg(database, owner);
    orgId = org.organization.id;
    materialsCategoryId = await findCostCategoryId(database, orgId);
  });

  afterAll(async () => {
    await database.close();
  });

  async function monthlyNet(from = MARCH, to = MARCH_END) {
    return database.asUser(owner.id, async (tx) => {
      const pair = await sumOrganizationRecognizedCostPairInDateRange(
        tx,
        orgId,
        ILS,
        from,
        to,
      );
      return pair.net.amount;
    });
  }

  it('10k expense + 6k AP match → monthly recognized 10k (not 6k only)', async () => {
    const projectId = await createProjectWithDefaultPackage(database, owner.id, orgId, 'Partial AP');

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Matched vendor' });
      const draft = await createExpense(context, {
        netAmount: '10000',
        amount: '10000',
        currency: ILS,
        vatMode: 'zero',
        description: 'Materials',
        projectId,
        costCategoryId: materialsCategoryId,
        costFamily: 'direct_project',
        expenseDate: '2026-03-10',
      });
      await finalizeExpense(context, draft.id);

      const bill = await createApBill(context, {
        vendorId: vendor.id,
        projectId,
        currency: ILS,
        totalAmount: '6000',
        billDate: '2026-03-12',
        dueDate: '2026-04-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Partial bill',
              quantity: '1',
              unitAmount: '6000',
              lineTotal: '6000',
              currency: ILS,
            },
          ],
          materialsCategoryId,
        ),
      });

      const match = await proposeApMatch(context, {
        apBillId: bill.id,
        expenseId: draft.id,
        matchedAmount: '6000',
        currency: ILS,
      });
      await acceptApMatch(context, { matchId: match.id });

      const financials = await getProjectFinancials(context, projectId);
      expect(financials.cost.actualCostToDate.amount).toBe('10000.000000');
    });

    expect(await monthlyNet()).toBe('10000.000000');
  });

  it('EMC applied 5k same month (no duplicate payroll expense) → monthly 5k', async () => {
    const employeeId = randomUUID();
    const projectId = await createProjectWithDefaultPackage(database, owner.id, orgId, 'EMC only');

    await database.asService(async (db) => {
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Payroll worker',
        status: 'active',
      });
    });

    await seedAppliedEmployeeMonthCost(database, {
      organizationId: orgId,
      employeeId,
      yearMonth: '2026-03',
      knownAmount: '5000.000000',
      projectId,
    });

    expect(await monthlyNet()).toBe('5000.000000');
  });

  it('inventory stock purchase expense → monthly recognized 0', async () => {
    const projectId = await createProjectWithDefaultPackage(database, owner.id, orgId, 'Inventory');

    const itemId = randomUUID();
    await database.asService(async (db) => {
      await db.insert(inventoryItems).values({
        id: itemId,
        organizationId: orgId,
        name: 'Stock SKU',
        unit: 'ea',
      });
      await db.insert(expenses).values({
        id: randomUUID(),
        organizationId: orgId,
        projectId,
        status: 'finalized',
        currency: ILS,
        netAmount: '3000.000000',
        grossAmount: '3000.000000',
        taxAmount: '0',
        expenseDate: '2026-03-08',
        description: 'Stock buy',
        costFamily: 'direct_project',
        costCategoryId: materialsCategoryId,
        installmentCount: 1,
        inventoryStockPurchase: true,
        inventoryItemId: itemId,
        inventoryPurchaseQty: '1',
        classificationStatus: 'classified',
      });
    });

    expect(await monthlyNet()).toBe('0.000000');
  });

  it('AP bill 5k − credit 1k → monthly 4k', async () => {
    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });
      const vendor = await createVendor(context, { name: 'Credit vendor' });
      const bill = await createApBill(context, {
        vendorId: vendor.id,
        currency: ILS,
        totalAmount: '5000',
        billDate: '2026-03-05',
        dueDate: '2026-04-01',
        lines: classifyApBillLines(
          [
            {
              description: 'Bill before credit',
              quantity: '1',
              unitAmount: '5000',
              lineTotal: '5000',
              currency: ILS,
            },
          ],
          materialsCategoryId,
        ),
      });
      const credit = await createVendorCredit(context, {
        vendorId: vendor.id,
        apBillId: bill.id,
        currency: ILS,
        amount: '1000',
        creditDate: '2026-03-06',
        reference: 'CR-1',
      });
      await postVendorCredit(context, credit.id);
      await applyVendorCredit(context, {
        creditId: credit.id,
        apBillId: bill.id,
        amount: '1000',
      });
    });

    expect(await monthlyNet()).toBe('4000.000000');
  });

  it('AP bill without bill_date appears in undated disclosure', async () => {
    const vendorId = randomUUID();
    let billId = '';

    await database.asService(async (db) => {
      await db.execute(sql`
        INSERT INTO vendors (id, organization_id, name)
        VALUES (${vendorId}::uuid, ${orgId}::uuid, 'Undated vendor')
      `);
      billId = await insertRecognizedApBill(db, {
        orgId,
        vendorId,
        amount: '2500',
        billDate: null,
      });
    });

    const disclosures = await database.asUser(owner.id, async (tx) =>
      listOrganizationUndatedOpenApBillDisclosures(tx, orgId, ILS),
    );
    expect(disclosures).toHaveLength(1);
    expect(disclosures[0]!.billId).toBe(billId);
    expect(disclosures[0]!.net.amount).toBe('2500.000000');
    expect(await monthlyNet()).toBe('0.000000');
  });

  it('draft EMC 2k → estimate breakdown line, excluded from monthly total', async () => {
    const employeeId = randomUUID();
    const emcId = randomUUID();

    await database.asService(async (db) => {
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Draft EMC',
        status: 'active',
      });
      await db.insert(employeeMonthCosts).values({
        id: emcId,
        organizationId: orgId,
        employeeId,
        yearMonth: '2026-03',
        currency: ILS,
        estimatedAmount: '2000.000000',
        knownAmount: '2000.000000',
        knownQuality: 'estimated',
        recognitionSource: 'monthly_allocated',
        status: 'draft',
      });
    });

    const lines = await database.asUser(owner.id, async (tx) =>
      listOrganizationRecognizedCostBreakdownInDateRange(tx, orgId, ILS, MARCH, MARCH_END),
    );
    const estimates = lines.filter((line) => line.estimate);
    expect(estimates).toHaveLength(1);
    expect(estimates[0]!.net.amount).toBe('2000.000000');
    expect(await monthlyNet()).toBe('0.000000');
  });
});
