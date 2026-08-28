/**
 * E2E harness database backend selection.
 *
 * - `pglite` (default): in-process PGlite + wire socket on :55432 for local suites.
 * - `postgres`: real PostgreSQL (CI smoke) — migrations + seedWorld via postgres-js.
 */
export type E2EDatabaseMode = 'pglite' | 'postgres';

export function e2eDatabaseMode(): E2EDatabaseMode {
  return process.env.E2E_DATABASE_MODE === 'postgres' ? 'postgres' : 'pglite';
}

export function isPostgresHarnessMode(): boolean {
  return e2eDatabaseMode() === 'postgres';
}

/** Database URL the harness and Next.js app should use for the active mode. */
export function resolveHarnessDatabaseUrl(pgliteUrl: string): string {
  if (!isPostgresHarnessMode()) return pgliteUrl;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('E2E_DATABASE_MODE=postgres requires DATABASE_URL');
  }
  return url;
}
