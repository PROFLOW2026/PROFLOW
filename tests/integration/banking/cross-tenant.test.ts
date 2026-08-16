import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  createBankAccount,
  drizzleBankingRepository,
  importBankStatement,
  resetBankingRepository,
  setBankingPersistenceReadyForTests,
  setBankingRepository,
} from '@/modules/banking';
import { resolveOrgContext } from '@/modules/tenancy';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

/**
 * Scenario B - Cross-tenant bank isolation (PGlite).
 * Org A transaction / import must not reference Org B account or import batch.
 */
describe('banking cross-tenant isolation (B)', () => {
  let database: TestDatabase;
  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let accountAId: string;
  let accountBId: string;
  let batchBId: string;

  beforeAll(async () => {
    database = await createTestDatabase();
  });

  afterAll(async () => {
    setBankingPersistenceReadyForTests(null);
    resetBankingRepository();
    await database.close();
  });

  beforeEach(async () => {
    await database.reset();
    setBankingPersistenceReadyForTests(true);
    setBankingRepository(drizzleBankingRepository);

    const { orgA, orgB, userA, userB } = await provisionTwoTenants(database);
    orgAId = orgA.organization.id;
    orgBId = orgB.organization.id;
    userAId = userA.id;
    userBId = userB.id;

    accountAId = await database.asUser(userAId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userAId,
        organizationId: orgAId,
        locale: 'en',
      });
      const account = await createBankAccount(context, {
        name: 'Org A Checking',
        currency: 'ILS',
      });
      return account.id;
    });

    const b = await database.asUser(userBId, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: userBId,
        organizationId: orgBId,
        locale: 'en',
      });
      const account = await createBankAccount(context, {
        name: 'Org B Checking',
        currency: 'ILS',
      });
      const imported = await importBankStatement(context, {
        bankAccountId: account.id,
        csvText: ['date,description,amount', '2026-08-01,B only,-50.00'].join('\n'),
        source: 'csv_import',
        fileName: 'b.csv',
      });
      return { accountId: account.id, batchId: imported.batch.id };
    });
    accountBId = b.accountId;
    batchBId = b.batchId;
  });

  afterEach(() => {
    setBankingPersistenceReadyForTests(null);
    resetBankingRepository();
  });

  it('rejects Org A import against Org B bank account', async () => {
    await expect(
      database.asUser(userAId, async (tx) => {
        const context = await resolveOrgContext(tx, {
          userId: userAId,
          organizationId: orgAId,
          locale: 'en',
        });
        return importBankStatement(context, {
          bankAccountId: accountBId,
          csvText: ['date,description,amount', '2026-08-02,A attempt,-10.00'].join('\n'),
          source: 'csv_import',
        });
      }),
    ).rejects.toThrow();
  });

  it('rejects Org A transaction insert referencing Org B account', async () => {
    await expect(
      database.asService(async (db) =>
        drizzleBankingRepository.insertTransactions(db, [
          {
            organizationId: orgAId,
            bankAccountId: accountBId,
            date: '2026-08-03',
            valueDate: null,
            description: 'cross-tenant',
            amount: '10.000000',
            currency: 'ILS',
            direction: 'debit',
            reference: null,
            source: 'csv_import',
            fingerprint: `cross-${Date.now()}`,
            matchStatus: 'unmatched',
            importBatchId: null,
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('rejects Org A transaction insert referencing Org B import batch', async () => {
    await expect(
      database.asService(async (db) =>
        drizzleBankingRepository.insertTransactions(db, [
          {
            organizationId: orgAId,
            bankAccountId: accountAId,
            date: '2026-08-04',
            valueDate: null,
            description: 'bad batch',
            amount: '12.000000',
            currency: 'ILS',
            direction: 'debit',
            reference: null,
            source: 'csv_import',
            fingerprint: `batch-cross-${Date.now()}`,
            matchStatus: 'unmatched',
            importBatchId: batchBId,
          },
        ]),
      ),
    ).rejects.toBeInstanceOf(DomainRuleError);
  });
});
