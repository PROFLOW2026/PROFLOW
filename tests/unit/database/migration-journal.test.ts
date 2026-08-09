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
const TAG_PATTERN = /^\d{4}_[a-z0-9_]+$/;

interface Journal {
  readonly entries: readonly {
    readonly idx: number;
    readonly tag: string;
    readonly when: number;
  }[];
}

async function loadJournal(): Promise<Journal> {
  return JSON.parse(
    await readFile(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'),
  ) as Journal;
}

describe('migration journal', () => {
  it('lists exactly the committed SQL files, in file order', async () => {
    const entries = await readdir(MIGRATIONS_DIR);
    const files = entries
      .filter((entry) => entry.endsWith('.sql'))
      .map((entry) => entry.replace(/\.sql$/, ''))
      .sort();

    const journal = await loadJournal();

    expect(journal.entries.map((entry) => entry.tag)).toEqual(files);
  });

  it('numbers entries consecutively from zero', async () => {
    const journal = await loadJournal();

    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  it('uses stable tag shape, unique numeric prefixes, and increasing when', async () => {
    const journal = await loadJournal();
    const prefixes = new Set<string>();
    let previousWhen = -Infinity;

    for (const entry of journal.entries) {
      expect(entry.tag).toMatch(TAG_PATTERN);
      const prefix = entry.tag.slice(0, 4);
      expect(prefixes.has(prefix)).toBe(false);
      prefixes.add(prefix);
      expect(entry.when).toBeGreaterThan(previousWhen);
      previousWhen = entry.when;
    }
  });

  it('keeps frozen 0012 content-present; 0013 remains in journal chain', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);

    expect(tags).toContain('0012_ap_vendor_portal');
    expect(tags).toContain('0013_document_owner_types');

    const sql = await readFile(
      path.join(MIGRATIONS_DIR, '0012_ap_vendor_portal.sql'),
      'utf8',
    );
    // Content freeze markers — must remain; do not weaken AP/portal integrity.
    expect(sql).toContain('ap_bills');
    expect(sql).toContain('ap_po_matches');
    expect(sql).toContain('external_access_grants_scope_present');
  });

  it('orders financial allocation migrations 0014→0018 after 0013', async () => {
    const journal = await loadJournal();
    const tags = journal.entries.map((entry) => entry.tag);
    const from13 = tags.slice(tags.indexOf('0013_document_owner_types'));
    expect(from13).toEqual([
      '0013_document_owner_types',
      '0014_allocation_engine',
      '0015_project_expected_remaining_cost',
      '0016_category_allocation_policy',
      '0017_periodic_allocation',
      '0018_allocation_run_integrity',
    ]);
  });
});
