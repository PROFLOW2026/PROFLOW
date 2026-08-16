/**
 * Durable vendor portal candidate persistence gate.
 * Owner applied `0020_overnight_foundations` - candidates use Drizzle.
 * Public portal login remains DISABLED regardless of this flag.
 */

export const PORTAL_CANDIDATES_PERSISTENCE_READY = true as boolean;

let overrideForTests: boolean | null = null;

/** Flip only in disposable PGlite / unit tests - never production. */
export function setPortalCandidatesPersistenceReadyForTests(value: boolean | null): void {
  overrideForTests = value;
}

export function arePortalCandidatesAvailable(): boolean {
  return overrideForTests ?? PORTAL_CANDIDATES_PERSISTENCE_READY;
}
