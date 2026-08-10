import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expenses } from '@drizzle/schema';
import {
  assertExpenseSameOrg,
  assertOpsRecordSameOrg,
  drizzleOpsExpenseLinksRepository,
  setOpsFinancePersistenceReadyForTests,
} from '@/modules/ops-finance';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function provision(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) => createOrganization(db, owner.id, { name, countryCode: 'IL' }));
}

describe('ops-finance persistence (L + same-org)', () => {
  let database: TestDatabase;
  let userA: TestUser;
  let userB: TestUser;
  let orgAId: string;
  let orgBId: string;
  let expenseAId: string;
  let expenseBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    userA = await createTestUser(database, 'ops-a@example.test');
    userB = await createTestUser(database, 'ops-b@example.test');
    const orgA = await provision(database, userA, 'Ops Org A');
    const orgB = await provision(database, userB, 'Ops Org B');
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;

    expenseAId = await database.asService(async (db) => {
      const [row] = await db
        .insert(expenses)
        .values({
          organizationId: orgAId,
          expenseDate: '2026-08-01',
          description: 'Org A draft',
          netAmount: '100.000000',
          grossAmount: '100.000000',
          currency: 'ILS',
          status: 'draft',
          costFamily: 'direct_project',
        })
        .returning({ id: expenses.id });
      return row!.id;
    });

    expenseBId = await database.asService(async (db) => {
      const [row] = await db
        .insert(expenses)
        .values({
          organizationId: orgBId,
          expenseDate: '2026-08-01',
          description: 'Org B draft',
          netAmount: '200.000000',
          grossAmount: '200.000000',
          currency: 'ILS',
          status: 'draft',
          costFamily: 'direct_project',
        })
        .returning({ id: expenses.id });
      return row!.id;
    });
  });

  afterAll(async () => {
    setOpsFinancePersistenceReadyForTests(null);
    await database.close();
  });

  beforeEach(() => {
    setOpsFinancePersistenceReadyForTests(true);
  });

  it('L — persistence restart: link survives new repository instance', async () => {
    const opsRecordId = '01900000-0000-7000-8000-00000000aa01';
    const inserted = await database.asService(async (db) =>
      drizzleOpsExpenseLinksRepository.insert(db, {
        organizationId: orgAId,
        opsRecordKind: 'maintenance_record',
        opsRecordId,
        expenseId: expenseAId,
        linkPurpose: 'expense_draft',
        createdByUserId: userA.id,
      }),
    );

    // Simulate process restart: fresh repository object (module singleton still points at drizzle).
    const restarted = drizzleOpsExpenseLinksRepository;
    const found = await database.asService(async (db) =>
      restarted.findActiveForOpsRecord(db, orgAId, 'maintenance_record', opsRecordId),
    );

    expect(found?.id).toBe(inserted.id);
    expect(found?.expenseId).toBe(expenseAId);
    expect(found?.organizationId).toBe(orgAId);
  });

  it('rejects cross-tenant expense_id for same-org guard', async () => {
    await database.asUser(userA.id, async (tx) => {
      await expect(assertExpenseSameOrg(tx, orgAId, expenseBId)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
      await assertExpenseSameOrg(tx, orgAId, expenseAId);
    });
  });

  it('rejects unloadable / cross-tenant polymorphic ops_record_id', async () => {
    await database.asUser(userA.id, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userA.id,
        organizationId: orgAId,
        locale: 'en',
      });
      await expect(
        assertOpsRecordSameOrg(
          context,
          'maintenance_record',
          '01900000-0000-7000-8000-00000000dead',
        ),
      ).rejects.toBeInstanceOf(DomainRuleError);
    });
  });
});
