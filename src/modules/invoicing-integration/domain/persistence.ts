/**
 * Durable external statutory invoicing *metadata* persistence gate.
 * Owner applied `0020_overnight_foundations` - metadata uses Drizzle.
 * Statutory issuance remains UNCONFIGURED / DISABLED until a real provider.
 */

export const INVOICING_INTEGRATION_PERSISTENCE_READY = true as boolean;

let overrideForTests: boolean | null = null;

/** Flip only in disposable PGlite / unit tests - never production. */
export function setInvoicingIntegrationPersistenceReadyForTests(
  value: boolean | null,
): void {
  overrideForTests = value;
}

export function areInvoicingIntegrationTablesAvailable(): boolean {
  return overrideForTests ?? INVOICING_INTEGRATION_PERSISTENCE_READY;
}
