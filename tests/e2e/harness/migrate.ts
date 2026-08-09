import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { PGlite } from '@electric-sql/pglite';
import { splitSqlStatements } from '../../setup/database';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

/**
 * Applies the committed migrations in order, from an empty database. This is
 * the same clean-start path the integration suite uses, so the harness proves
 * the migrations are reproducible as a side effect of booting.
 *
 * Nothing is filtered out: a statement PGlite cannot run must fail here rather
 * than leave the end-to-end suite green against a schema production will never
 * have.
 */
export async function applyMigrations(client: PGlite): Promise<void> {
  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter((entry) => entry.endsWith('.sql')).sort();

  for (const file of files) {
    const raw = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitSqlStatements(raw.replaceAll('--> statement-breakpoint', ''));

    for (const statement of statements) {
      try {
        await client.exec(statement);
      } catch (error) {
        throw new Error(`Migration ${file} failed on:\n${statement.slice(0, 300)}\n\n${String(error)}`);
      }
    }
  }
}
