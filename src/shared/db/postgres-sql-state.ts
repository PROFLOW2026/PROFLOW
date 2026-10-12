/** Walks Drizzle/postgres-js error chains for a Postgres SQLSTATE (e.g. 42501). */
export function postgresSqlState(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === 'object'; depth += 1) {
    const record = current as { code?: unknown; cause?: unknown };
    if (typeof record.code === 'string' && record.code.length > 0) {
      return record.code;
    }
    current = record.cause;
  }
  return undefined;
}

export function isPostgresPermissionDenied(error: unknown): boolean {
  return postgresSqlState(error) === '42501';
}
