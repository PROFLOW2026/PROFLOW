import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  contracts,
  contractValueEvents,
  employees,
  expenses,
  billingRecords,
  organizationMemberships,
  organizations,
  profiles,
  projects,
  timeEntries,
  workPackages,
} from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { getHomeDashboard } from '@/modules/financials/application/get-home-dashboard';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { rolePermissions } from '@drizzle/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from '../../setup/database';

describe('financials currency integrity', () => {
  let database: TestDatabase;
  let orgId: string;
  let userId: string;
  let membershipId: string;
  let ownerRoleId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    orgId = randomUUID();
    userId = randomUUID();
    membershipId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await seedSystemData(db);

      await db.insert(profiles).values({
        id: userId,
        email: 'owner@example.test',
        displayName: 'Owner',
      });

      await db.insert(organizations).values({
        id: orgId,
        name: 'Mixed Currency Co',
        baseCurrency: 'ILS',
        timezone: 'Asia/Jerusalem',
        countryCode: 'IL',
        defaultLocale: 'he-IL',
      });

      await db.insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        status: 'active',
      });

      const roles = await provisionOrganizationRoles(db, orgId);
      ownerRoleId = roles.owner;
      await assignRole(db, {
        organizationId: orgId,
        membershipId,
        userId,
        roleId: ownerRoleId,
      });
    });
  });

  async function seedProject(input: {
    name: string;
    currency: string;
    contractValue: string;
    expense?: { amount: string; currency: string };
  }): Promise<string> {
    return database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);

      const projectId = randomUUID();
      await db.insert(projects).values({
        id: projectId,
        organizationId: orgId,
        name: input.name,
        status: 'active',
        currency: input.currency,
      });

      await db.insert(workPackages).values({
        organizationId: orgId,
        projectId,
        name: 'General',
        isDefault: true,
        sortOrder: 0,
      });

      const contractId = randomUUID();
      await db.insert(contracts).values({
        id: contractId,
        organizationId: orgId,
        projectId,
        isPrimary: true,
        originalValueAmount: input.contractValue,
        currency: input.currency,
      });

      await db.insert(contractValueEvents).values({
        organizationId: orgId,
        contractId,
        projectId,
        kind: 'original',
        amount: input.contractValue,
        currency: input.currency,
        effectiveDate: '2026-01-01',
      });

      if (input.expense) {
        await db.insert(expenses).values({
          organizationId: orgId,
          projectId,
          expenseDate: '2026-02-01',
          netAmount: input.expense.amount,
          grossAmount: input.expense.amount,
          currency: input.expense.currency,
          status: 'finalized',
          costFamily: 'direct_project',
        });
      }

      return projectId;
    });
  }

  it('sums active contract values only in base currency and marks partial coverage (HIGH-5)', async () => {
    await seedProject({ name: 'ILS Tower', currency: 'ILS', contractValue: '100000.000000' });
    await seedProject({ name: 'USD Site', currency: 'USD', contractValue: '50000.000000' });

    const dashboard = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getHomeDashboard(context);
    });

    expect(dashboard.totalContractValue?.amount).toBe('100000.000000');
    expect(dashboard.contractValueCoverage?.partials).toEqual([
      { reason: 'foreign_currency_contracts_excluded', count: 1 },
    ]);
  });

  it('returns project financials when a foreign-currency expense exists (HIGH-4)', async () => {
    const projectId = await seedProject({
      name: 'Mixed Expenses',
      currency: 'ILS',
      contractValue: '80000.000000',
      expense: { amount: '10000.000000', currency: 'ILS' },
    });

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(expenses).values({
        organizationId: orgId,
        projectId,
        expenseDate: '2026-03-01',
        netAmount: '2500.000000',
        grossAmount: '2500.000000',
        currency: 'USD',
        status: 'finalized',
        costFamily: 'direct_project',
      });
    });

    const financials = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectFinancials(context, projectId);
    });

    expect(financials.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(financials.coverage.partials).toEqual([
      { reason: 'foreign_currency_expenses_excluded', count: 1 },
    ]);
  });

  it('redacts commercial figures without contracts.read instead of showing zeros (LOW-15)', async () => {
    const projectId = await seedProject({
      name: 'Restricted View',
      currency: 'ILS',
      contractValue: '120000.000000',
      expense: { amount: '5000.000000', currency: 'ILS' },
    });

    await database.asService(async (db) => {
      await db.delete(rolePermissions).where(
        and(
          eq(rolePermissions.roleId, ownerRoleId),
          inArray(rolePermissions.permissionKey, [
            PERMISSIONS.CONTRACTS_READ,
            PERMISSIONS.PROJECT_PROFIT_READ,
          ]),
        ),
      );
    });

    const financials = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectFinancials(context, projectId);
    });

    expect(financials.commercial).toBeNull();
    expect(financials.cost.actualCostToDate.amount).toBe('5000.000000');
  });

  it('flags workforce entries missing cost in coverage (MEDIUM-12)', async () => {
    const projectId = await seedProject({
      name: 'Labor Gaps',
      currency: 'ILS',
      contractValue: '90000.000000',
    });

    const employeeId = randomUUID();

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(employees).values({
        id: employeeId,
        organizationId: orgId,
        name: 'Worker',
        status: 'active',
      });
      await db.insert(timeEntries).values([
        {
          organizationId: orgId,
          employeeId,
          workDate: '2026-06-01',
          hours: '8',
          kind: 'project',
          projectId,
          costAmount: '800.000000',
          costCurrency: 'ILS',
        },
        {
          organizationId: orgId,
          employeeId,
          workDate: '2026-06-02',
          hours: '4',
          kind: 'project',
          projectId,
          costAmount: null,
          costCurrency: null,
        },
      ]);
    });

    const financials = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectFinancials(context, projectId);
    });

    expect(financials.coverage.partials).toEqual([
      { reason: 'workforce_entries_missing_cost', count: 1 },
    ]);
  });

  it('flags foreign-currency billing records in coverage partials', async () => {
    const projectId = await seedProject({
      name: 'Mixed Billing',
      currency: 'ILS',
      contractValue: '60000.000000',
    });

    await database.asService(async (db) => {
      await db.execute(sql`SET ROLE service_role`);
      await db.insert(billingRecords).values([
        {
          organizationId: orgId,
          projectId,
          kind: 'invoice',
          status: 'finalized',
          subtotalAmount: '5000.000000',
          totalAmount: '5000.000000',
          currency: 'ILS',
          issueDate: '2026-04-01',
        },
        {
          organizationId: orgId,
          projectId,
          kind: 'invoice',
          status: 'finalized',
          subtotalAmount: '1000.000000',
          totalAmount: '1000.000000',
          currency: 'USD',
          issueDate: '2026-04-02',
        },
      ]);
    });

    const financials = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId: orgId,
        locale: 'en',
      });
      return getProjectFinancials(context, projectId);
    });

    expect(financials.billing.invoiced.amount).toBe('5000.000000');
    expect(financials.coverage.partials).toEqual([
      { reason: 'foreign_currency_billing_excluded', count: 1 },
    ]);
  });
});
