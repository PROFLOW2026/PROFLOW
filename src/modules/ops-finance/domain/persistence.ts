/**
 * Durable `ops_expense_links` persistence gate.
 * Owner applied `0020_overnight_foundations` — production uses Drizzle.
 */

export const OPS_FINANCE_PERSISTENCE_READY = true as boolean;

let overrideForTests: boolean | null = null;

/** Flip only in disposable PGlite / unit tests — never production. */
export function setOpsFinancePersistenceReadyForTests(value: boolean | null): void {
  overrideForTests = value;
}

export function areOpsFinanceLinksAvailable(): boolean {
  return overrideForTests ?? OPS_FINANCE_PERSISTENCE_READY;
}
