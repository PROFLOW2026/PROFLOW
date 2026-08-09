/** Normalises `db.execute` results across postgres-js and PGlite drivers. */
export function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export function sqlFirstRow<T>(result: unknown): T | undefined {
  return sqlRows<T>(result)[0];
}
