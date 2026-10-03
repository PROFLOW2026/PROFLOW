/** After this many failed attempts an event is parked (dead letter) until an operator intervenes. */
export const DG_MAX_ATTEMPTS = 8;

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 6 * 60 * 60 * 1000;

/** Exponential backoff: 30s, 2m, 8m, 32m, ~2h, then capped at 6h. `attempts` counts failures so far. */
export function retryDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 4 ** exponent);
}

export function nextAttemptAt(attempts: number, now: Date): Date {
  return new Date(now.getTime() + retryDelayMs(attempts));
}

export function isDeadLettered(attempts: number): boolean {
  return attempts >= DG_MAX_ATTEMPTS;
}

const MAX_ERROR_LENGTH = 1000;

export function describeConsumerError(error: unknown): string {
  const message = error instanceof Error && error.message.trim() ? error.message : String(error ?? 'unknown');
  return message.length > MAX_ERROR_LENGTH ? message.slice(0, MAX_ERROR_LENGTH) : message;
}
