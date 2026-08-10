/** Public API of the banking / reconciliation module (overnight wave Agent 3). */

export type {
  BankAccount,
  BankAccountStatus,
  BankTransaction,
  BankTxnDirection,
  BankTxnMatchStatus,
  BankTxnSource,
  BankMatchTargetKind,
  BankUserDecision,
  BankMatchSuggestion,
  BankMatchDecision,
  BankImportBatch,
  BankMatchCandidate,
} from './domain/types';

export {
  BANK_ACCOUNT_STATUSES,
  BANK_TXN_DIRECTIONS,
  BANK_TXN_MATCH_STATUSES,
  BANK_TXN_SOURCES,
  BANK_MATCH_TARGET_KINDS,
  BANK_USER_DECISIONS,
} from './domain/types';

export {
  BANKING_PERSISTENCE_READY,
  areBankingPersistenceAvailable,
  setBankingPersistenceReadyForTests,
} from './domain/persistence';

export {
  bankTransactionFingerprint,
  normalizeBankDescription,
  normalizeBankReference,
} from './domain/fingerprint';

export {
  detectBankImportDuplicates,
  isDuplicateRow,
} from './domain/duplicates';
export type { BankImportRowCandidate, BankDuplicateHit } from './domain/duplicates';

export { suggestBankMatches } from './domain/suggestions';
export { buildBankMatchDecision } from './domain/decisions';
export type { DecideBankMatchInput, DecideBankMatchResult } from './domain/decisions';

export {
  assertBankMatchDoesNotMutateFinancials,
  assertBankMatchDoesNotCreateProjectCost,
  isBankMatchRecognizedActual,
  isBankMatchCreatingProjectCost,
  shouldRecognizeBankTxnAsProjectCost,
} from './domain/cost-guard';

export {
  parseBankStatementCsv,
  matrixToCsvText,
} from './domain/parse-statement';
export type {
  ParsedBankStatement,
  ParsedBankStatementRow,
} from './domain/parse-statement';

export {
  autoMapBankColumns,
  applyBankMapping,
  emptyBankColumnMapping,
  BANK_IMPORT_FIELD_KEYS,
} from './domain/import-columns';
export type { BankImportFieldKey, BankColumnMapping } from './domain/import-columns';

export {
  StubBankFeedProvider,
  getBankFeedProvider,
  setBankFeedProviderForTests,
} from './domain/feed-provider';
export type {
  BankFeedProvider,
  BankFeedAccountRef,
  BankFeedTransactionRef,
  BankFeedErrorCode,
} from './domain/feed-provider';

export { resetBankingStoreForTests } from './data/banking-test-double.store';
export {
  drizzleBankingRepository,
  gatedBankingRepository,
  getBankingRepository,
  setBankingRepository,
  resetBankingRepository,
  createBankingTestDoubleRepository,
} from './data/banking.repository';
export type { BankingRepository } from './data/banking.repository';

export { assertBankMatchTargetInOrganization } from './data/match-target-guard';

export {
  createBankAccount,
  listBankAccounts,
  getBankAccount,
  archiveBankAccount,
} from './application/accounts';

export { importBankStatement } from './application/import-statement';
export type { ImportBankStatementResult } from './application/import-statement';
export { importBankStatementXlsx } from './application/import-xlsx';

export {
  listBankTransactions,
  getBankTransactionDetail,
} from './application/list-transactions';

export { refreshBankMatchSuggestions } from './application/suggest-matches';
export { decideBankMatch } from './application/decide-match';
export type { DecideBankMatchAppResult } from './application/decide-match';

export {
  createBankAccountSchema,
  importBankStatementSchema,
  listBankTransactionsSchema,
  decideBankMatchSchema,
  refreshSuggestionsSchema,
} from './validation/schemas';
export type {
  CreateBankAccountInput,
  ImportBankStatementInput,
  ListBankTransactionsInput,
  DecideBankMatchInput as DecideBankMatchSchemaInput,
  RefreshSuggestionsInput,
} from './validation/schemas';
