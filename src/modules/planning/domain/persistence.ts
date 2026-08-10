/**
 * Planning persistence gate. Owner applied `0020_overnight_foundations` —
 * production uses Drizzle. Critical Path remains foundation-only.
 * Test override via `setPlanningPersistenceReadyForTests`.
 */
export let PLANNING_PERSISTENCE_READY = true;

export function arePlanningWritesDurable(): boolean {
  return PLANNING_PERSISTENCE_READY;
}

/** Test / Lead hook — never flip in production code paths. */
export function setPlanningPersistenceReadyForTests(ready: boolean): void {
  PLANNING_PERSISTENCE_READY = ready;
}
