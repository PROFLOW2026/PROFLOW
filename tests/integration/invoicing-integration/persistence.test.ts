import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { billingRecords } from '@drizzle/schema';
import {
  assertBillingRecordSameOrg,
  drizzleExternalDocumentsRepository,
  drizzleProviderConnectionsRepository,
  setInvoicingIntegrationPersistenceReadyForTests,
} from '@/modules/invoicing-integration';
import { createOrganization } from '@/modules/tenancy';
import { DomainRuleError } from '@/shared/errors';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestUser, seedSystem, type TestUser } from '@tests/setup/fixtures';

async function provision(database: TestDatabase, owner: TestUser, name: string) {
  return database.asService(async (db) => createOrganization(db, owner.id, { name, countryCode: 'IL' }));
}

describe('invoicing-integration persistence (L + cross-tenant)', () => {
  let database: TestDatabase;
  let userA: TestUser;
  let userB: TestUser;
  let orgAId: string;
  let orgBId: string;
  let billingAId: string;
  let billingBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
    await seedSystem(database);
    userA = await createTestUser(database, 'inv-a@example.test');
    userB = await createTestUser(database, 'inv-b@example.test');
    const orgA = await provision(database, userA, 'Inv Org A');
    const orgB = await provision(database, userB, 'Inv Org B');
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;

    billingAId = await database.asService(async (db) => {
      const [row] = await db
        .insert(billingRecords)
        .values({
          organizationId: orgAId,
          kind: 'invoice',
          issueDate: '2026-08-01',
          status: 'finalized',
          subtotalAmount: '100.000000',
          totalAmount: '100.000000',
          currency: 'ILS',
          createdByUserId: userA.id,
        })
        .returning({ id: billingRecords.id });
      return row!.id;
    });

    billingBId = await database.asService(async (db) => {
      const [row] = await db
        .insert(billingRecords)
        .values({
          organizationId: orgBId,
          kind: 'invoice',
          issueDate: '2026-08-01',
          status: 'finalized',
          subtotalAmount: '50.000000',
          totalAmount: '50.000000',
          currency: 'ILS',
          createdByUserId: userB.id,
        })
        .returning({ id: billingRecords.id });
      return row!.id;
    });
  });

  afterAll(async () => {
    setInvoicingIntegrationPersistenceReadyForTests(null);
    await database.close();
  });

  beforeEach(() => {
    setInvoicingIntegrationPersistenceReadyForTests(true);
  });

  it('L — persistence restart: external document + connection survive', async () => {
    const doc = await database.asService(async (db) =>
      drizzleExternalDocumentsRepository.create(db, {
        organizationId: orgAId,
        billingRecordId: billingAId,
        providerId: 'scripted-test-provider',
        kind: 'tax_invoice',
        status: 'requested',
      }),
    );

    const connection = await database.asService(async (db) =>
      drizzleProviderConnectionsRepository.upsert(db, {
        organizationId: orgAId,
        providerId: 'scripted-test-provider',
        status: 'disconnected',
        capabilities: {},
      }),
    );

    const foundDoc = await database.asService(async (db) =>
      drizzleExternalDocumentsRepository.findById(db, orgAId, doc.id),
    );
    const foundConn = await database.asService(async (db) =>
      drizzleProviderConnectionsRepository.findByOrganization(db, orgAId),
    );

    expect(foundDoc?.id).toBe(doc.id);
    expect(foundDoc?.billingRecordId).toBe(billingAId);
    expect(foundConn?.id).toBe(connection.id);
    expect(foundConn?.status).toBe('disconnected');
  });

  it('rejects cross-tenant billing_record_id', async () => {
    await database.asService(async (db) => {
      await expect(assertBillingRecordSameOrg(db, orgAId, billingBId)).rejects.toBeInstanceOf(
        DomainRuleError,
      );
      await assertBillingRecordSameOrg(db, orgAId, billingAId);
    });
  });
});
