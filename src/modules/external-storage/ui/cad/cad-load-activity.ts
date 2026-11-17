export type LoadWait = 'working' | 'long' | 'stuck' | 'failed';

/** Show a delay notice once measurable progress has been quiet for this long. */
export const LOAD_DELAY_MS = 12_000;

/** A quiet load becomes "stuck" only after the delay notice, and it is not cancelled. */
export const LOAD_STUCK_MS = 45_000;

export function classifyLoadWait(elapsedSinceProgressMs: number, failed: boolean): LoadWait {
  if (failed) return 'failed';
  if (elapsedSinceProgressMs < LOAD_DELAY_MS) return 'working';
  if (elapsedSinceProgressMs < LOAD_STUCK_MS) return 'long';
  return 'stuck';
}
