import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  contracts,
  contractValueEvents,
  expenses,
  profiles,
  projects,
  workPackages,
} from '@drizzle/schema';
import { createOrganization } from '@/modules/tenancy/application/create-organization';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import { resolveOrgContext } from '@/modules/tenancy/application/resolve-org-context';
import { seedSystemData } from '@drizzle/seed/system';
import { createTestDatabase, type TestDatabase } from '../../setup/database';
import { materialsCategoryId, zeroVatFinalizedExpenseRow } from '../../setup/cost-category-fixtures';

async function createTestUser(database: TestDatabase): Promise<{ id: string; email: string }> {
  const id = randomUUID();
  const email = `user-${id.slice(0, 8)}@example.test`;

  await database.asService(async (db) => {
    await db.insert(profiles).values({ id, email, displayName: email.split('@')[0]! });
  });

  return { id, email };
}

async function provisionOrganization(
  database: TestDatabase,
  userId: string,
  name: string,
): Promise<string> {
  const result = await database.asService(async (db) =>
    createOrganization(db, userId, { name, countryCode: 'IL' }),
  );
  return result.organization.id;
}

async function seedProjectWithFinancials(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  name: string,
  contractValue: string,
): Promise<string> {
  return database.asUser(userId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({
        organizationId,
        name,
        status: 'active',
        currency: 'ILS',
      })
      .returning();

    await tx.insert(workPackages).values({
      organizationId,
      projectId: project!.id,
      name: 'General',
      isDefault: true,
      sortOrder: 0,
    });

    const [contract] = await tx
      .insert(contracts)
      .values({
        organizationId,
        projectId: project!.id,
        isPrimary: true,
        originalValueAmount: contractValue,
        currency: 'ILS',
      })
      .returning();

    await tx.insert(contractValueEvents).values({
      organizationId,
      contractId: contract!.id,
      projectId: project!.id,
      kind: 'original',
      amount: contractValue,
      currency: 'ILS',
      effectiveDate: '2026-01-01',
    });

    const costCategoryId = await materialsCategoryId(tx, organizationId);
    await tx.insert(expenses).values(
      zeroVatFinalizedExpenseRow({
        organizationId,
        projectId: project!.id,
        costCategoryId,
        amount: '10000.000000',
      }),
    );

    return project!.id;
  });
}

describe('financials tenant isolation', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await database.asService(async (db) => {
      await seedSystemData(db);
    });
  });

  it('prevents organization B from reading organization A project financials', async () => {
    const userA = await createTestUser(database);
    const userB = await createTestUser(database);
    const orgA = await provisionOrganization(database, userA.id, 'Alpha Electrical');
    const orgB = await provisionOrganization(database, userB.id, 'Beta Construction');

    const projectId = await seedProjectWithFinancials(
      database,
      userA.id,
      orgA,
      'Secret Tower',
      '250000.000000',
    );

    await expect(
      database.asUser(userB.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userB.id,
          organizationId: orgB,
          locale: 'en',
        });

        return getProjectFinancials(context, projectId);
      }),
    ).rejects.toThrow();
  });

  it('returns financials for the owning organization', async () => {
    const owner = await createTestUser(database);
    const orgId = await provisionOrganization(database, owner.id, 'Gamma Build');

    const projectId = await seedProjectWithFinancials(
      database,
      owner.id,
      orgId,
      'Office Fit-out',
      '80000.000000',
    );

    const financials = await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: orgId,
        locale: 'en',
      });

      return getProjectFinancials(context, projectId);
    });

    expect(financials.commercial?.currentContractValue.amount).toBe('80000.000000');
    expect(financials.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(financials.profit?.estimatedProfit.amount).toBe('70000.000000');
  });
});
