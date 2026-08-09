import { contracts, contractValueEvents, projects, workPackages } from '@drizzle/schema';
import { describe, expect, it, afterAll, beforeAll, beforeEach } from 'vitest';
import { createChangeRequest } from '@/modules/commercial/application/change-requests';
import {
  createQuoteVersion,
  issueQuoteVersion,
} from '@/modules/commercial/application/quotes-and-approval';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem } from '@tests/setup/fixtures';

async function provisionTenant(database: TestDatabase, name: string, email: string) {
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

describe('quote version issuing', () => {
  let database: TestDatabase;
  let organizationId: string;
  let userId: string;
  let changeRequestId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    await seedSystem(database);

    const { owner, organization } = await provisionTenant(
      database,
      'Quote Revisions Ltd',
      'quotes@example.test',
    );
    organizationId = organization.id;
    userId = owner.id;

    const { projectId } = await seedProjectWithContract(
      database,
      organizationId,
      userId,
      'Kitchen extension',
    );

    changeRequestId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const changeRequest = await createChangeRequest(context, {
        projectId,
        title: 'Extra sockets',
        direction: 'addition',
        requestedAmount: '2500',
      });
      return changeRequest.changeRequestId;
    });
  });

  it('issues a second quote version without unique-index failure', async () => {
    const firstVersionId = await database.asUser(userId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId,
        organizationId,
        locale: 'en',
      });
      const created = await createQuoteVersion(context, {
        changeRequestId,
        lines: [{ description: 'Sockets v1', lineTotal: '2500' }],
      });
      await issueQuoteVersion(context, { quoteVersionId: created.quoteVersionId });
      return created.quoteVersionId;
    });

    await expect(
      database.asUser(userId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId,
          organizationId,
          locale: 'en',
        });
        const revised = await createQuoteVersion(context, {
          changeRequestId,
          lines: [{ description: 'Sockets v2', lineTotal: '3000' }],
        });
        await issueQuoteVersion(context, { quoteVersionId: revised.quoteVersionId });
        return revised.quoteVersionId;
      }),
    ).resolves.not.toThrow();

    expect(firstVersionId).toBeTruthy();
  });
});
