/**
 * Banking durable persistence against overnight tables:
 * bank_accounts, bank_import_batches, bank_transactions,
 * bank_match_suggestions, bank_match_decisions.
 *
 * Production: Drizzle only when BANKING_PERSISTENCE_READY is true.
 * When false: gated stub fails closed (schemaPending).
 * In-memory adapter = TEST DOUBLE ONLY (see banking-test-double.store.ts).
 */

import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  bankAccounts,
  bankImportBatches,
  bankMatchDecisions,
  bankMatchSuggestions,
  bankTransactions,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError, NotFoundError, ServiceUnavailableError } from '@/shared/errors';
import { areBankingPersistenceAvailable } from '../domain/persistence';
import type {
  BankAccount,
  BankAccountStatus,
  BankImportBatch,
  BankMatchDecision,
  BankMatchSuggestion,
  BankTransaction,
  BankTxnMatchStatus,
  BankTxnSource,
} from '../domain/types';
import {
  createImportBatch as tdCreateBatch,
  createBankAccount as tdCreateAccount,
  findBankAccount as tdFindAccount,
  findBankTransaction as tdFindTxn,
  insertBankMatchDecision as tdInsertDecision,
  insertBankTransactions as tdInsertTxns,
  listBankAccounts as tdListAccounts,
  listBankTransactions as tdListTxns,
  listDecisionsForTransaction as tdListDecisions,
  listSuggestionsForTransaction as tdListSuggestions,
  replaceSuggestionsForTransaction as tdReplaceSuggestions,
  resetBankingStoreForTests,
  setBankAccountStatus as tdSetStatus,
  updateBankTransactionStatus as tdUpdateStatus,
} from './banking-test-double.store';

export interface BankAccountInsert {
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  readonly accountMask?: string | null;
}

export interface BankImportBatchInsert {
  readonly organizationId: string;
  readonly bankAccountId: string;
  readonly source: Exclude<BankTxnSource, 'live_feed'>;
  readonly fileName: string | null;
  readonly rowCount: number;
  readonly importedCount: number;
  readonly duplicateCount: number;
}

export type BankTransactionInsert = Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>;

export type BankMatchSuggestionInsert = Omit<BankMatchSuggestion, 'id' | 'createdAt'>;

export type BankMatchDecisionInsert = Omit<BankMatchDecision, 'id' | 'createdAt'>;

export interface BankingRepository {
  createAccount(db: DbExecutor, input: BankAccountInsert): Promise<BankAccount>;
  listAccounts(db: DbExecutor, organizationId: string): Promise<BankAccount[]>;
  findAccount(
    db: DbExecutor,
    organizationId: string,
    accountId: string,
  ): Promise<BankAccount | null>;
  setAccountStatus(
    db: DbExecutor,
    organizationId: string,
    accountId: string,
    status: BankAccountStatus,
  ): Promise<BankAccount | null>;

  createImportBatch(db: DbExecutor, input: BankImportBatchInsert): Promise<BankImportBatch>;
  findImportBatch(
    db: DbExecutor,
    organizationId: string,
    batchId: string,
  ): Promise<BankImportBatch | null>;

  insertTransactions(
    db: DbExecutor,
    rows: readonly BankTransactionInsert[],
  ): Promise<BankTransaction[]>;
  listTransactions(
    db: DbExecutor,
    organizationId: string,
    filter?: {
      bankAccountId?: string;
      matchStatus?: BankTxnMatchStatus | readonly BankTxnMatchStatus[];
    },
  ): Promise<BankTransaction[]>;
  findTransaction(
    db: DbExecutor,
    organizationId: string,
    transactionId: string,
  ): Promise<BankTransaction | null>;
  updateTransactionMatchStatus(
    db: DbExecutor,
    organizationId: string,
    transactionId: string,
    matchStatus: BankTxnMatchStatus,
  ): Promise<BankTransaction | null>;

  replaceSuggestions(
    db: DbExecutor,
    organizationId: string,
    bankTransactionId: string,
    suggestions: readonly BankMatchSuggestionInsert[],
  ): Promise<BankMatchSuggestion[]>;
  listSuggestions(
    db: DbExecutor,
    organizationId: string,
    bankTransactionId: string,
  ): Promise<BankMatchSuggestion[]>;

  insertDecision(db: DbExecutor, decision: BankMatchDecisionInsert): Promise<BankMatchDecision>;
  listDecisions(
    db: DbExecutor,
    organizationId: string,
    bankTransactionId: string,
  ): Promise<BankMatchDecision[]>;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapAccount(row: typeof bankAccounts.$inferSelect): BankAccount {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    currency: row.currency,
    accountMask: row.accountMask,
    status: row.status as BankAccountStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapBatch(row: typeof bankImportBatches.$inferSelect): BankImportBatch {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bankAccountId: row.bankAccountId,
    source: row.source as Exclude<BankTxnSource, 'live_feed'>,
    fileName: row.fileName,
    rowCount: row.rowCount,
    importedCount: row.importedCount,
    duplicateCount: row.duplicateCount,
    createdAt: toIso(row.createdAt),
  };
}

function mapTxn(row: typeof bankTransactions.$inferSelect): BankTransaction {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bankAccountId: row.bankAccountId,
    date: row.date,
    valueDate: row.valueDate,
    description: row.description,
    amount: row.amount,
    currency: row.currency,
    direction: row.direction as BankTransaction['direction'],
    reference: row.reference,
    source: row.source as BankTxnSource,
    fingerprint: row.fingerprint,
    matchStatus: row.matchStatus as BankTxnMatchStatus,
    importBatchId: row.importBatchId,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapSuggestion(row: typeof bankMatchSuggestions.$inferSelect): BankMatchSuggestion {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bankTransactionId: row.bankTransactionId,
    targetKind: row.targetKind as BankMatchSuggestion['targetKind'],
    targetId: row.targetId,
    suggestedAmount: row.suggestedAmount,
    currency: row.currency,
    score: row.score,
    rationale: row.rationale,
    createdAt: toIso(row.createdAt),
  };
}

function mapDecision(row: typeof bankMatchDecisions.$inferSelect): BankMatchDecision {
  return {
    id: row.id,
    organizationId: row.organizationId,
    bankTransactionId: row.bankTransactionId,
    decision: row.decision as BankMatchDecision['decision'],
    targetKind: (row.targetKind as BankMatchDecision['targetKind']) ?? null,
    targetId: row.targetId,
    appliedAmount: row.appliedAmount,
    currency: row.currency,
    notes: row.notes,
    mutatesFinancials: false,
    createsProjectCost: false,
    createdAt: toIso(row.createdAt),
  };
}

function unavailable(): never {
  throw new ServiceUnavailableError(
    'Banking requires overnight schema (see src/modules/banking/SCHEMA_REQUEST.md)',
    'banking.errors.schemaPending',
  );
}

async function assertAccountOwned(
  db: DbExecutor,
  organizationId: string,
  bankAccountId: string,
): Promise<typeof bankAccounts.$inferSelect> {
  const [row] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, bankAccountId), eq(bankAccounts.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'Bank account must belong to the same organization',
      'banking.errors.crossOrgAccount',
    );
  }
  return row;
}

async function assertBatchOwned(
  db: DbExecutor,
  organizationId: string,
  bankAccountId: string,
  importBatchId: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(bankImportBatches)
    .where(
      and(
        eq(bankImportBatches.id, importBatchId),
        eq(bankImportBatches.organizationId, organizationId),
        eq(bankImportBatches.bankAccountId, bankAccountId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'Import batch must belong to the same organization and account',
      'banking.errors.crossOrgImport',
    );
  }
}

/** Gated stub — production default while BANKING_PERSISTENCE_READY is false. */
export const gatedBankingRepository: BankingRepository = {
  async createAccount() {
    unavailable();
  },
  async listAccounts() {
    if (!areBankingPersistenceAvailable()) return [];
    unavailable();
  },
  async findAccount() {
    if (!areBankingPersistenceAvailable()) return null;
    unavailable();
  },
  async setAccountStatus() {
    unavailable();
  },
  async createImportBatch() {
    unavailable();
  },
  async findImportBatch() {
    if (!areBankingPersistenceAvailable()) return null;
    unavailable();
  },
  async insertTransactions() {
    unavailable();
  },
  async listTransactions() {
    if (!areBankingPersistenceAvailable()) return [];
    unavailable();
  },
  async findTransaction() {
    if (!areBankingPersistenceAvailable()) return null;
    unavailable();
  },
  async updateTransactionMatchStatus() {
    unavailable();
  },
  async replaceSuggestions() {
    unavailable();
  },
  async listSuggestions() {
    if (!areBankingPersistenceAvailable()) return [];
    unavailable();
  },
  async insertDecision() {
    unavailable();
  },
  async listDecisions() {
    if (!areBankingPersistenceAvailable()) return [];
    unavailable();
  },
};

export const drizzleBankingRepository: BankingRepository = {
  async createAccount(db, input) {
    const [inserted] = await db
      .insert(bankAccounts)
      .values({
        organizationId: input.organizationId,
        name: input.name.trim(),
        currency: input.currency.toUpperCase(),
        accountMask: input.accountMask ?? null,
        status: 'active',
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert bank account');
    return mapAccount(inserted);
  },

  async listAccounts(db, organizationId) {
    const rows = await db
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.organizationId, organizationId))
      .orderBy(bankAccounts.name);
    return rows.map(mapAccount);
  },

  async findAccount(db, organizationId, accountId) {
    const [row] = await db
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.organizationId, organizationId)))
      .limit(1);
    return row ? mapAccount(row) : null;
  },

  async setAccountStatus(db, organizationId, accountId, status) {
    const [row] = await db
      .update(bankAccounts)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.organizationId, organizationId)))
      .returning();
    return row ? mapAccount(row) : null;
  },

  async createImportBatch(db, input) {
    await assertAccountOwned(db, input.organizationId, input.bankAccountId);
    const [inserted] = await db
      .insert(bankImportBatches)
      .values({
        organizationId: input.organizationId,
        bankAccountId: input.bankAccountId,
        source: input.source,
        fileName: input.fileName,
        rowCount: input.rowCount,
        importedCount: input.importedCount,
        duplicateCount: input.duplicateCount,
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert bank import batch');
    return mapBatch(inserted);
  },

  async findImportBatch(db, organizationId, batchId) {
    const [row] = await db
      .select()
      .from(bankImportBatches)
      .where(
        and(eq(bankImportBatches.id, batchId), eq(bankImportBatches.organizationId, organizationId)),
      )
      .limit(1);
    return row ? mapBatch(row) : null;
  },

  async insertTransactions(db, rows) {
    if (rows.length === 0) return [];

    for (const row of rows) {
      await assertAccountOwned(db, row.organizationId, row.bankAccountId);
      if (row.importBatchId) {
        await assertBatchOwned(db, row.organizationId, row.bankAccountId, row.importBatchId);
      }
    }

    const inserted = await db
      .insert(bankTransactions)
      .values(
        rows.map((row) => ({
          organizationId: row.organizationId,
          bankAccountId: row.bankAccountId,
          date: row.date,
          valueDate: row.valueDate,
          description: row.description,
          amount: row.amount,
          currency: row.currency,
          direction: row.direction,
          reference: row.reference,
          source: row.source,
          fingerprint: row.fingerprint,
          matchStatus: row.matchStatus,
          importBatchId: row.importBatchId,
        })),
      )
      .returning();
    return inserted.map(mapTxn);
  },

  async listTransactions(db, organizationId, filter) {
    const conditions = [eq(bankTransactions.organizationId, organizationId)];
    if (filter?.bankAccountId) {
      conditions.push(eq(bankTransactions.bankAccountId, filter.bankAccountId));
    }
    if (filter?.matchStatus) {
      const statuses = Array.isArray(filter.matchStatus)
        ? [...filter.matchStatus]
        : [filter.matchStatus];
      if (statuses.length === 1) {
        conditions.push(eq(bankTransactions.matchStatus, statuses[0]!));
      } else if (statuses.length > 1) {
        conditions.push(inArray(bankTransactions.matchStatus, statuses));
      }
    }

    const rows = await db
      .select()
      .from(bankTransactions)
      .where(and(...conditions))
      .orderBy(desc(bankTransactions.date), bankTransactions.id);
    return rows.map(mapTxn);
  },

  async findTransaction(db, organizationId, transactionId) {
    const [row] = await db
      .select()
      .from(bankTransactions)
      .where(
        and(
          eq(bankTransactions.id, transactionId),
          eq(bankTransactions.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ? mapTxn(row) : null;
  },

  async updateTransactionMatchStatus(db, organizationId, transactionId, matchStatus) {
    const [row] = await db
      .update(bankTransactions)
      .set({ matchStatus, updatedAt: new Date() })
      .where(
        and(
          eq(bankTransactions.id, transactionId),
          eq(bankTransactions.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? mapTxn(row) : null;
  },

  async replaceSuggestions(db, organizationId, bankTransactionId, suggestions) {
    const txn = await this.findTransaction(db, organizationId, bankTransactionId);
    if (!txn) throw new NotFoundError('Bank transaction');

    await db
      .delete(bankMatchSuggestions)
      .where(
        and(
          eq(bankMatchSuggestions.organizationId, organizationId),
          eq(bankMatchSuggestions.bankTransactionId, bankTransactionId),
        ),
      );

    if (suggestions.length === 0) return [];

    const inserted = await db
      .insert(bankMatchSuggestions)
      .values(
        suggestions.map((row) => ({
          organizationId,
          bankTransactionId,
          targetKind: row.targetKind,
          targetId: row.targetId,
          suggestedAmount: row.suggestedAmount,
          currency: row.currency,
          score: row.score,
          rationale: row.rationale,
        })),
      )
      .returning();
    return inserted.map(mapSuggestion).sort((a, b) => b.score - a.score);
  },

  async listSuggestions(db, organizationId, bankTransactionId) {
    const rows = await db
      .select()
      .from(bankMatchSuggestions)
      .where(
        and(
          eq(bankMatchSuggestions.organizationId, organizationId),
          eq(bankMatchSuggestions.bankTransactionId, bankTransactionId),
        ),
      )
      .orderBy(desc(bankMatchSuggestions.score));
    return rows.map(mapSuggestion);
  },

  async insertDecision(db, decision) {
    const txn = await this.findTransaction(
      db,
      decision.organizationId,
      decision.bankTransactionId,
    );
    if (!txn) throw new NotFoundError('Bank transaction');

    const [inserted] = await db
      .insert(bankMatchDecisions)
      .values({
        organizationId: decision.organizationId,
        bankTransactionId: decision.bankTransactionId,
        decision: decision.decision,
        targetKind: decision.targetKind,
        targetId: decision.targetId,
        appliedAmount: decision.appliedAmount,
        currency: decision.currency,
        notes: decision.notes,
        mutatesFinancials: false,
        createsProjectCost: false,
      })
      .returning();
    if (!inserted) throw new Error('Failed to insert bank match decision');
    return mapDecision(inserted);
  },

  async listDecisions(db, organizationId, bankTransactionId) {
    const rows = await db
      .select()
      .from(bankMatchDecisions)
      .where(
        and(
          eq(bankMatchDecisions.organizationId, organizationId),
          eq(bankMatchDecisions.bankTransactionId, bankTransactionId),
        ),
      )
      .orderBy(desc(bankMatchDecisions.createdAt));
    return rows.map(mapDecision);
  },
};

let activeRepository: BankingRepository = areBankingPersistenceAvailable()
  ? drizzleBankingRepository
  : gatedBankingRepository;

/** Test / Lead hook — swap in Drizzle or TEST DOUBLE after schema lands. */
export function setBankingRepository(repo: BankingRepository): void {
  activeRepository = repo;
}

export function getBankingRepository(): BankingRepository {
  return activeRepository;
}

export function resetBankingRepository(): void {
  activeRepository = areBankingPersistenceAvailable()
    ? drizzleBankingRepository
    : gatedBankingRepository;
}

/**
 * TEST DOUBLE ONLY — process-local store for unit tests.
 * Never used as the production default when the readiness flag is false
 * (production uses gatedBankingRepository → schemaPending).
 */
export function createBankingTestDoubleRepository(): BankingRepository & {
  readonly __testDouble: true;
} {
  resetBankingStoreForTests();
  return {
    __testDouble: true,

    async createAccount(_db, input) {
      return tdCreateAccount(input);
    },
    async listAccounts(_db, organizationId) {
      return tdListAccounts(organizationId);
    },
    async findAccount(_db, organizationId, accountId) {
      return tdFindAccount(organizationId, accountId);
    },
    async setAccountStatus(_db, organizationId, accountId, status) {
      return tdSetStatus(organizationId, accountId, status);
    },
    async createImportBatch(_db, input) {
      const account = tdFindAccount(input.organizationId, input.bankAccountId);
      if (!account) {
        throw new DomainRuleError(
          'Bank account must belong to the same organization',
          'banking.errors.crossOrgAccount',
        );
      }
      return tdCreateBatch(input);
    },
    async findImportBatch(_db, organizationId, batchId) {
      // Test double does not expose batch lookup by id currently — always null.
      void organizationId;
      void batchId;
      return null;
    },
    async insertTransactions(_db, rows) {
      if (rows.length === 0) return [];
      const organizationId = rows[0]!.organizationId;
      for (const row of rows) {
        if (row.organizationId !== organizationId) {
          throw new DomainRuleError(
            'Bank transactions must share organization',
            'banking.errors.crossOrgAccount',
          );
        }
        const account = tdFindAccount(row.organizationId, row.bankAccountId);
        if (!account) {
          throw new DomainRuleError(
            'Bank account must belong to the same organization',
            'banking.errors.crossOrgAccount',
          );
        }
      }
      return tdInsertTxns(organizationId, rows);
    },
    async listTransactions(_db, organizationId, filter) {
      return tdListTxns(organizationId, filter);
    },
    async findTransaction(_db, organizationId, transactionId) {
      return tdFindTxn(organizationId, transactionId);
    },
    async updateTransactionMatchStatus(_db, organizationId, transactionId, matchStatus) {
      return tdUpdateStatus(organizationId, transactionId, matchStatus);
    },
    async replaceSuggestions(_db, organizationId, bankTransactionId, suggestions) {
      return tdReplaceSuggestions(organizationId, bankTransactionId, suggestions);
    },
    async listSuggestions(_db, organizationId, bankTransactionId) {
      return tdListSuggestions(organizationId, bankTransactionId);
    },
    async insertDecision(_db, decision) {
      return tdInsertDecision(decision.organizationId, decision);
    },
    async listDecisions(_db, organizationId, bankTransactionId) {
      return tdListDecisions(organizationId, bankTransactionId);
    },
  };
}
