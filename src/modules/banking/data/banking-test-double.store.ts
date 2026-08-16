import { randomUUID } from 'node:crypto';
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

/**
 * TEST DOUBLE ONLY - process-local banking store for unit tests.
 *
 * Production default when BANKING_PERSISTENCE_READY is false is the gated
 * repository (schemaPending), not this store. Wire via
 * `createBankingTestDoubleRepository()` exclusively in tests.
 */

type OrgBucket = {
  accounts: Map<string, BankAccount>;
  transactions: Map<string, BankTransaction>;
  suggestions: Map<string, BankMatchSuggestion>;
  decisions: Map<string, BankMatchDecision>;
  batches: Map<string, BankImportBatch>;
};

const byOrg = new Map<string, OrgBucket>();

function bucket(organizationId: string): OrgBucket {
  let b = byOrg.get(organizationId);
  if (!b) {
    b = {
      accounts: new Map(),
      transactions: new Map(),
      suggestions: new Map(),
      decisions: new Map(),
      batches: new Map(),
    };
    byOrg.set(organizationId, b);
  }
  return b;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resetBankingStoreForTests(): void {
  byOrg.clear();
}

export function createBankAccount(input: {
  organizationId: string;
  name: string;
  currency: string;
  accountMask?: string | null;
}): BankAccount {
  const createdAt = nowIso();
  const account: BankAccount = {
    id: randomUUID(),
    organizationId: input.organizationId,
    name: input.name.trim(),
    currency: input.currency.toUpperCase(),
    accountMask: input.accountMask ?? null,
    status: 'active',
    createdAt,
    updatedAt: createdAt,
  };
  bucket(input.organizationId).accounts.set(account.id, account);
  return account;
}

export function listBankAccounts(organizationId: string): BankAccount[] {
  return [...bucket(organizationId).accounts.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

export function findBankAccount(
  organizationId: string,
  accountId: string,
): BankAccount | null {
  return bucket(organizationId).accounts.get(accountId) ?? null;
}

export function setBankAccountStatus(
  organizationId: string,
  accountId: string,
  status: BankAccountStatus,
): BankAccount | null {
  const existing = findBankAccount(organizationId, accountId);
  if (!existing) return null;
  const next = { ...existing, status, updatedAt: nowIso() };
  bucket(organizationId).accounts.set(accountId, next);
  return next;
}

export function insertBankTransactions(
  organizationId: string,
  rows: readonly Omit<BankTransaction, 'id' | 'createdAt' | 'updatedAt'>[],
): BankTransaction[] {
  const createdAt = nowIso();
  const out: BankTransaction[] = [];
  const store = bucket(organizationId);
  for (const row of rows) {
    const txn: BankTransaction = {
      ...row,
      id: randomUUID(),
      createdAt,
      updatedAt: createdAt,
    };
    store.transactions.set(txn.id, txn);
    out.push(txn);
  }
  return out;
}

export function listBankTransactions(
  organizationId: string,
  filter?: {
    bankAccountId?: string;
    matchStatus?: BankTxnMatchStatus | readonly BankTxnMatchStatus[];
  },
): BankTransaction[] {
  const statuses = filter?.matchStatus
    ? new Set(
        Array.isArray(filter.matchStatus)
          ? filter.matchStatus
          : [filter.matchStatus],
      )
    : null;
  return [...bucket(organizationId).transactions.values()]
    .filter((txn) => {
      if (filter?.bankAccountId && txn.bankAccountId !== filter.bankAccountId) {
        return false;
      }
      if (statuses && !statuses.has(txn.matchStatus)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function findBankTransaction(
  organizationId: string,
  transactionId: string,
): BankTransaction | null {
  return bucket(organizationId).transactions.get(transactionId) ?? null;
}

export function updateBankTransactionStatus(
  organizationId: string,
  transactionId: string,
  matchStatus: BankTxnMatchStatus,
): BankTransaction | null {
  const existing = findBankTransaction(organizationId, transactionId);
  if (!existing) return null;
  const next = { ...existing, matchStatus, updatedAt: nowIso() };
  bucket(organizationId).transactions.set(transactionId, next);
  return next;
}

export function replaceSuggestionsForTransaction(
  organizationId: string,
  bankTransactionId: string,
  suggestions: readonly Omit<BankMatchSuggestion, 'id' | 'createdAt'>[],
): BankMatchSuggestion[] {
  const store = bucket(organizationId);
  for (const [id, sug] of store.suggestions) {
    if (sug.bankTransactionId === bankTransactionId) {
      store.suggestions.delete(id);
    }
  }
  const createdAt = nowIso();
  const out: BankMatchSuggestion[] = [];
  for (const row of suggestions) {
    const sug: BankMatchSuggestion = {
      ...row,
      id: randomUUID(),
      createdAt,
    };
    store.suggestions.set(sug.id, sug);
    out.push(sug);
  }
  return out;
}

export function listSuggestionsForTransaction(
  organizationId: string,
  bankTransactionId: string,
): BankMatchSuggestion[] {
  return [...bucket(organizationId).suggestions.values()]
    .filter((s) => s.bankTransactionId === bankTransactionId)
    .sort((a, b) => b.score - a.score);
}

export function insertBankMatchDecision(
  organizationId: string,
  decision: Omit<BankMatchDecision, 'id' | 'createdAt'>,
): BankMatchDecision {
  const row: BankMatchDecision = {
    ...decision,
    id: randomUUID(),
    createdAt: nowIso(),
  };
  bucket(organizationId).decisions.set(row.id, row);
  return row;
}

export function listDecisionsForTransaction(
  organizationId: string,
  bankTransactionId: string,
): BankMatchDecision[] {
  return [...bucket(organizationId).decisions.values()]
    .filter((d) => d.bankTransactionId === bankTransactionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createImportBatch(input: {
  organizationId: string;
  bankAccountId: string;
  source: Exclude<BankTxnSource, 'live_feed'>;
  fileName: string | null;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
}): BankImportBatch {
  const batch: BankImportBatch = {
    id: randomUUID(),
    organizationId: input.organizationId,
    bankAccountId: input.bankAccountId,
    source: input.source,
    fileName: input.fileName,
    rowCount: input.rowCount,
    importedCount: input.importedCount,
    duplicateCount: input.duplicateCount,
    createdAt: nowIso(),
  };
  bucket(input.organizationId).batches.set(batch.id, batch);
  return batch;
}
