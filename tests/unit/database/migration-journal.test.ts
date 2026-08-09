import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The two migration runners disagree unless the journal is maintained by hand.
 *
 * `drizzle/scripts/migrate.ts` — the only path to a real environment — asks the
 * Drizzle migrator for the entries in `meta/_journal.json`, while the test
 * harnesses read every `.sql` file straight off disk. A hand-written migration
 * that never reaches the journal therefore passes the whole suite and is
 * silently skipped in production.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'drizzle/migrations');

interface Journal {
  readonly entries: readonly { readonly idx: number; readonly tag: string }[];
}

describe('migration journal', () => {
  it('lists exactly the committed SQL files, in file order', async () => {
    const entries = await readdir(MIGRATIONS_DIR);
    const files = entries
      .filter((entry) => entry.endsWith('.sql'))
      .map((entry) => entry.replace(/\.sql$/, ''))
      .sort();

    const journal = JSON.parse(
      await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as Journal;

    expect(journal.entries.map((entry) => entry.tag)).toEqual(files);
  });

  it('numbers entries consecutively from zero', async () => {
    const journal = JSON.parse(
      await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
    ) as Journal;

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });
});
