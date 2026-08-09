import { contracts, contractValueEvents, projects, workPackages } from '@drizzle/schema';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createChangeRequest } from '@/modules/commercial/application/change-requests';
import {
  getProjectCommercialSummary,
  listAllChangeRequests,
  listProjectChangeRequests,
} from '@/modules/commercial/application/queries';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

/**
 * Regression: pricedAmount subquery must qualify change_requests.id
 * (bare "id" is ambiguous with quotes.id under PGlite/Postgres).
 */
describe('change request list SQL (pricedAmount subquery)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);
  });

  it('lists project/org change requests and pending summary without ambiguous id', async () => {
    const owner = await createTestUser(database, 'changes-sql@test.local');
    const org = await database.asService(async (db) =>
      createOrganization(db, owner.id, { name: 'Changes SQL Org', countryCode: 'IL' }),
    );

    const projectId = await database.asUser(owner.id, async (tx) => {
      const [project] = await tx
        .insert(projects)
        .values({ organizationId: org.organization.id, name: 'P1', currency: 'ILS' })
        .returning({ id: projects.id });

      await tx.insert(workPackages).values({
        organizationId: org.organization.id,
        projectId: project!.id,
        name: 'General',
        isDefault: true,
      });

      const [contract] = await tx
        .insert(contracts)
        .values({
          organizationId: org.organization.id,
          projectId: project!.id,
          isPrimary: true,
          originalValueAmount: '100000.000000',
          currency: 'ILS',
        })
        .returning({ id: contracts.id });

      await tx.insert(contractValueEvents).values({
        organizationId: org.organization.id,
        contractId: contract!.id,
        projectId: project!.id,
        kind: 'original',
        amount: '100000.000000',
        currency: 'ILS',
        effectiveDate: '2026-01-01',
        actorUserId: owner.id,
      });

      return project!.id;
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'he-IL',
      });
      await createChangeRequest(context, {
        projectId,
        title: 'תוספת חשמל',
        direction: 'addition',
        requestedAmount: '2500',
      });
    });

    await database.asUser(owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: owner.id,
        organizationId: org.organization.id,
        locale: 'he-IL',
      });

      const projectRows = await listProjectChangeRequests(context, projectId);
      expect(projectRows).toHaveLength(1);
      expect(projectRows[0]?.title).toBe('תוספת חשמל');

      const summary = await getProjectCommercialSummary(context, projectId);
      expect(summary).not.toBeNull();
      expect(summary!.position.pendingChanges.amount).toBeDefined();

      const orgRows = await listAllChangeRequests(context, { status: 'all' });
      expect(orgRows.some((row) => row.title === 'תוספת חשמל')).toBe(true);
    });
  });
});
