/**
 * Ops → Finance bridges (overnight Agent 7 / PRE-SQL Agent E).
 *
 * Pattern: operational record alone ≠ Actual.
 * Explicit "Create linked expense" → Expense draft + ops_expense_links row.
 * Finalize uses existing finalizeExpense (allocation engine unchanged).
 * Inventory movements are never financial expenses.
 *
 * Persistence: Drizzle when `OPS_FINANCE_PERSISTENCE_READY`; otherwise
 * TEST DOUBLE in-memory store only (non-durable).
 */

export {
  createLinkedExpenseFromOpsRecord,
  type CreateExpenseFn,
  type CreateLinkedExpenseResult,
} from './application/create-linked-expense';
export { finalizeLinkedOpsExpense, type FinalizeExpenseFn } from './application/finalize-linked-expense';
export {
  getActiveOpsExpenseLink,
  getOpsExpenseLinkByExpenseId,
  listOpsExpenseLinksForRecords,
  peekOpsExpenseLinksForRecords,
} from './application/get-ops-expense-link';
export { loadOpsRecordCostSnapshot } from './application/load-ops-snapshot';

export {
  OPS_RECORD_KINDS,
  OPS_LINK_PURPOSES,
  FORBIDDEN_OPS_LINK_KINDS,
} from './domain/types';
export type {
  OpsRecordKind,
  OpsLinkPurpose,
  OpsExpenseLink,
  OpsRecordCostSnapshot,
  ForbiddenOpsLinkKind,
} from './domain/types';

export {
  OPS_FINANCE_PERSISTENCE_READY,
  areOpsFinanceLinksAvailable,
  setOpsFinancePersistenceReadyForTests,
} from './domain/persistence';

export {
  isOpsRecordCostActual,
  isInventoryMovementFinancialExpense,
  shouldDeduplicateMaterialCostWithVendorRecognition,
  isLinkableOpsRecordKind,
  isForbiddenOpsLinkKind,
  assertOpsRecordKindLinkable,
  expenseStatusContributesToActual,
  opsCostAloneExpenseContributions,
} from './domain/rules';

export {
  mapOpsRecordToExpenseDraft,
  defaultCostFamilyForOpsKind,
  resolveOpsLinkPurpose,
} from './domain/map-to-expense';

export { assertExpenseSameOrg, assertOpsRecordSameOrg } from './data/same-org-guards';

export {
  resetOpsExpenseLinksStoreForTests,
  findActiveLinkForOpsRecord,
  findActiveLinkForExpense,
  listActiveLinksForOpsRecords,
} from './data/ops-expense-links.store';

export {
  drizzleOpsExpenseLinksRepository,
  type OpsExpenseLinksRepository,
  type OpsExpenseLinkInsert,
} from './data/ops-expense-links.repository';

export {
  getOpsExpenseLinksRepository,
  setOpsExpenseLinksRepositoryForTests,
  insertOpsExpenseLinkRow,
  findActiveLinkForOpsRecordRow,
  findActiveLinkForExpenseRow,
  listActiveLinksForOpsRecordsRow,
} from './data/ops-expense-links';

export {
  createLinkedExpenseSchema,
  finalizeLinkedExpenseSchema,
  opsExpenseLinkLookupSchema,
} from './validation/schemas';
export type {
  CreateLinkedExpenseInput,
  FinalizeLinkedExpenseInput,
  OpsExpenseLinkLookupInput,
} from './validation/schemas';

/** UI: import from `@/modules/ops-finance/ui/create-linked-expense-form` (client). */
