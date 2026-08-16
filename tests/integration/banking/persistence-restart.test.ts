import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  drizzleBankingRepository,
  resetBankingRepository,
  setBankingPersistenceReadyForTests,
  setBankingRepository,
} from '@/modules/banking';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { provisionTwoTenants } from '../billing/setup';

/**
 * Scenario L - Persistence restart: data survives a new repository instance.
 */
describe('banking persistence restart (L)', () => {
  let database: TestDatabase;
  let organizationId: string;

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

    const { orgA } = await provisionTwoTenants(database);
    organizationId = orgA.organization.id;
  });

  afterEach(() => {
    setBankingPersistenceReadyForTests(null);
    resetBankingRepository();
  });

  it('keeps accounts, batches, and transactions after new repository instance', async () => {
    const created = await database.asService(async (db) => {
      const repo1 = drizzleBankingRepository;
      const account = await repo1.createAccount(db, {
        organizationId,
        name: 'Restart Checking',
        currency: 'ILS',
        accountMask: '****1234',
      });
      const batch = await repo1.createImportBatch(db, {
        organizationId,
        bankAccountId: account.id,
        source: 'csv_import',
        fileName: 'restart.csv',
        rowCount: 1,
        importedCount: 1,
        duplicateCount: 0,
      });
      const [txn] = await repo1.insertTransactions(db, [
        {
          organizationId,
          bankAccountId: account.id,
          date: '2026-08-05',
          valueDate: null,
          description: 'Durable row',
          amount: '99.500000',
          currency: 'ILS',
          direction: 'credit',
          reference: 'R-1',
          source: 'csv_import',
          fingerprint: 'restart-fp-1',
          matchStatus: 'unmatched',
          importBatchId: batch.id,
        },
      ]);
      return { accountId: account.id, batchId: batch.id, txnId: txn!.id };
    });

    // Simulate process restart: fresh repository binding (stateless drizzle object).
    resetBankingRepository();
    setBankingRepository(drizzleBankingRepository);
    const repo2 = drizzleBankingRepository;

    await database.asService(async (db) => {
      const account = await repo2.findAccount(db, organizationId, created.accountId);
      expect(account).not.toBeNull();
      expect(account?.name).toBe('Restart Checking');

      const batch = await repo2.findImportBatch(db, organizationId, created.batchId);
      expect(batch).not.toBeNull();
      expect(batch?.fileName).toBe('restart.csv');

      const txn = await repo2.findTransaction(db, organizationId, created.txnId);
      expect(txn).not.toBeNull();
      expect(txn?.description).toBe('Durable row');
      expect(txn?.amount).toBe('99.500000');
      expect(txn?.importBatchId).toBe(created.batchId);
    });
  });
});
