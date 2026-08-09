import { contracts, contractValueEvents, projects, workPackages } from '@drizzle/schema';
import { describe, expect, it, afterAll, beforeAll, beforeEach } from 'vitest';
import {
  createChangeRequest,
  submitChangeRequestForApproval,
} from '@/modules/commercial/application/change-requests';
import { getChangeRequestDetail } from '@/modules/commercial/application/queries';
import { approveChangeRequest } from '@/modules/commercial/application/quotes-and-approval';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

async function provisionTenant(
  database: TestDatabase,
  name: string,
  email: string,
) {
  const owner = await createTestUser(database, email);
  const org = await database.asService(async (db) =>
    createOrganization(db, owner.id, { name, countryCode: 'IL' }),
  );
  return { owner, organization: org.organization };
}

async function seedProjectWithContract(
  database: TestDatabase,
  organizationId: string,
  userId: string,
  name: string,
): Promise<{ projectId: string; contractId: string }> {
  return database.asUser(userId, async (tx) => {
    const [project] = await tx
      .insert(projects)
      .values({ organizationId, name, currency: 'ILS' })
      .returning({ id: projects.id });

    await tx.insert(workPackages).values({
      organizationId,
      projectId: project!.id,
      name: 'General',
      isDefault: true,
    });

    const [contract] = await tx
      .insert(contracts)
      .values({
        organizationId,
        projectId: project!.id,
        isPrimary: true,
        originalValueAmount: '500000.000000',
        currency: 'ILS',
      })
      .returning({ id: contracts.id });

    await tx.insert(contractValueEvents).values({
      organizationId,
      contractId: contract!.id,
      projectId: project!.id,
      kind: 'original',
      amount: '500000.000000',
      currency: 'ILS',
      effectiveDate: '2026-01-01',
      actorUserId: userId,
    });

    return { projectId: project!.id, contractId: contract!.id };
  });
}

describe('commercial tenant isolation', () => {
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

  it('prevents org B from reading org A change requests', async () => {
    const orgA = await provisionTenant(database, 'Alpha Electrical', 'owner-a@test.com');
    const orgB = await provisionTenant(database, 'Beta Construction', 'owner-b@test.com');

    const projectA = await seedProjectWithContract(
      database,
      orgA.organization.id,
      orgA.owner.id,
      'Project Alpha',
    );

    const created = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      return createChangeRequest(context, {
        projectId: projectA.projectId,
        title: 'Extra lighting',
        direction: 'addition',
        requestedAmount: '12000',
      });
    });

    await expect(
      database.asUser(orgB.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgB.owner.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return getChangeRequestDetail(context, created.changeRequestId);
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('prevents org B from approving org A change requests even with the ID', async () => {
    const orgA = await provisionTenant(database, 'Alpha Electrical', 'owner-a@test.com');
    const orgB = await provisionTenant(database, 'Beta Construction', 'owner-b@test.com');

    const projectA = await seedProjectWithContract(
      database,
      orgA.organization.id,
      orgA.owner.id,
      'Project Alpha',
    );

    const created = await database.asUser(orgA.owner.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: orgA.owner.id,
        organizationId: orgA.organization.id,
        locale: 'en',
      });
      const result = await createChangeRequest(context, {
        projectId: projectA.projectId,
        title: 'HVAC upgrade',
        direction: 'addition',
        requestedAmount: '25000',
      });
      await submitChangeRequestForApproval(context, result.changeRequestId);
      return result;
    });

    await expect(
      database.asUser(orgB.owner.id, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: orgB.owner.id,
          organizationId: orgB.organization.id,
          locale: 'en',
        });
        return approveChangeRequest(context, {
          changeRequestId: created.changeRequestId,
          effectiveDate: '2026-02-01',
        });
      }),
    ).rejects.toSatisfy(
      (error: unknown) => error instanceof NotFoundError || error instanceof AuthorizationError,
    );
  });
});
