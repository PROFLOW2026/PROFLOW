import type { PGlite } from '@electric-sql/pglite';
import { applySqlMigrations } from '../../setup/database';

/**
 * Applies the committed migrations in order, from an empty database. This is
 * the same clean-start path the integration suite uses, so the harness proves
 * the migrations are reproducible as a side effect of booting.
 *
 * Uses `applySqlMigrations` so PGlite gets the same Supabase auth compatibility
 * bootstrap (auth.uid() → app.user_id) as integration tests — without changing
 * production migrations.
 */
export async function applyMigrations(client: PGlite): Promise<void> {
  await applySqlMigrations(client);
}
