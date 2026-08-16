/**
 * Banking / bank reconciliation V1 domain types.
 *
 * HARD RULES:
 * - Import + suggestions only; user must Approve / Change / Ignore.
 * - No silent finalized financial writes (payment / bill / expense / cost).
 * - Matching a vendor payment for an already-recognized bill is cash reconciliation,
 *   never project Actual Cost.
 * - Live bank feed is an extension point - V1 is CSV/XLSX only.
 */

export const BANK_ACCOUNT_STATUSES = ['active', 'archived'] as const;
export type BankAccountStatus = (typeof BANK_ACCOUNT_STATUSES)[number];

/** Statement direction: credit = money in, debit = money out. */
export const BANK_TXN_DIRECTIONS = ['credit', 'debit'] as const;
export type BankTxnDirection = (typeof BANK_TXN_DIRECTIONS)[number];

export const BANK_TXN_MATCH_STATUSES = [
  'unmatched',
  'partially_matched',
  'matched',
  'ignored',
] as const;
export type BankTxnMatchStatus = (typeof BANK_TXN_MATCH_STATUSES)[number];

export const BANK_TXN_SOURCES = ['csv_import', 'xlsx_import', 'live_feed'] as const;
export type BankTxnSource = (typeof BANK_TXN_SOURCES)[number];

export const BANK_MATCH_TARGET_KINDS = [
  'customer_payment',
  'billing_record',
  'vendor_payment',
  'vendor_bill',
] as const;
export type BankMatchTargetKind = (typeof BANK_MATCH_TARGET_KINDS)[number];

export const BANK_USER_DECISIONS = ['approve', 'change', 'ignore'] as const;
export type BankUserDecision = (typeof BANK_USER_DECISIONS)[number];

export interface BankAccount {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly currency: string;
  /** Optional IBAN / account number display (not a live feed credential). */
  readonly accountMask: string | null;
  readonly status: BankAccountStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BankTransaction {
  readonly id: string;
  readonly organizationId: string;
  readonly bankAccountId: string;
  /** Booking / statement date (YYYY-MM-DD). */
  readonly date: string;
  /** Value date when present (YYYY-MM-DD). */
  readonly valueDate: string | null;
  readonly description: string;
  /** Absolute amount as numeric string (storage scale). */
  readonly amount: string;
  readonly currency: string;
  readonly direction: BankTxnDirection;
  readonly reference: string | null;
  readonly source: BankTxnSource;
  /** Stable fingerprint for duplicate detection within org + account. */
  readonly fingerprint: string;
  readonly matchStatus: BankTxnMatchStatus;
  readonly importBatchId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BankMatchSuggestion {
  readonly id: string;
  readonly organizationId: string;
  readonly bankTransactionId: string;
  readonly targetKind: BankMatchTargetKind;
  readonly targetId: string;
  /** Suggested apply amount (may be partial). */
  readonly suggestedAmount: string;
  readonly currency: string;
  /** 0–100 confidence score for ranking. */
  readonly score: number;
  readonly rationale: string;
  readonly createdAt: string;
}

/**
 * User decision recorded against a bank transaction.
 * Does NOT mutate billing/AP/expense ledgers by itself.
 */
export interface BankMatchDecision {
  readonly id: string;
  readonly organizationId: string;
  readonly bankTransactionId: string;
  readonly decision: BankUserDecision;
  readonly targetKind: BankMatchTargetKind | null;
  readonly targetId: string | null;
  readonly appliedAmount: string | null;
  readonly currency: string | null;
  readonly notes: string | null;
  /**
   * Always false for V1 - decisions are reconciliation intent only.
   * Financial mutation requires an explicit separate application path.
   */
  readonly mutatesFinancials: false;
  /**
   * Always false - bank↔vendor-payment match never becomes project cost.
   */
  readonly createsProjectCost: false;
  readonly createdAt: string;
}

export interface BankImportBatch {
  readonly id: string;
  readonly organizationId: string;
  readonly bankAccountId: string;
  readonly source: Exclude<BankTxnSource, 'live_feed'>;
  readonly fileName: string | null;
  readonly rowCount: number;
  readonly importedCount: number;
  readonly duplicateCount: number;
  readonly createdAt: string;
}

/** Candidate open items used to build suggestions (injected by application). */
export interface BankMatchCandidate {
  readonly kind: BankMatchTargetKind;
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly date: string | null;
  readonly reference: string | null;
  readonly counterpartyLabel: string | null;
  /** Remaining open amount when partially paid; defaults to `amount`. */
  readonly openAmount?: string;
  /**
   * When true, target is a vendor bill already recognizing Actual Cost
   * (or a payment against such a bill). Matching must stay cash-only.
   */
  readonly billAlreadyRecognized?: boolean;
}
