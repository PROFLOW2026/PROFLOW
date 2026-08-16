/**
 * OCR job metadata / review-state persistence gate.
 * Owner applied `0020_overnight_foundations` - production uses Drizzle.
 * Azure live HTTP is gated by `AZURE_OCR_LIVE_HTTP_READY` in feature-gate.ts.
 * Test override via `setOcrPersistenceReadyForTests`.
 */
export let OCR_PERSISTENCE_READY = true;

export function areOcrJobsDurable(): boolean {
  return OCR_PERSISTENCE_READY;
}

/** Test / Lead hook - never flip in production code paths. */
export function setOcrPersistenceReadyForTests(ready: boolean): void {
  OCR_PERSISTENCE_READY = ready;
}
