import { randomUUID } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ensures a PostgreSQL-compatible UUID for time-entry idempotency. */
export function ensureValidClientRequestId(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (trimmed && UUID_RE.test(trimmed)) return trimmed;
  return randomUUID();
}

export function isValidClientRequestId(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  return Boolean(trimmed && UUID_RE.test(trimmed));
}
