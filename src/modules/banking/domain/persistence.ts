/**
 * Banking persistence gate for accounts / imports / transactions / matches.
 * Owner applied `0020_overnight_foundations` — production uses Drizzle.
 * Live bank feed remains disabled separately. Test override via
 * `setBankingPersistenceReadyForTests`.
 */

export const BANKING_PERSISTENCE_READY = true as boolean;

let testReadyOverride: boolean | null = null;

export function areBankingPersistenceAvailable(): boolean {
  return testReadyOverride ?? BANKING_PERSISTENCE_READY;
}

/**
 * Test / Lead hook only. Pass `null` to restore the compile-time flag.
 * Never call from production request paths.
 */
export function setBankingPersistenceReadyForTests(ready: boolean | null): void {
  testReadyOverride = ready;
}
