/**
 * Fail CI when SQL migrations and meta/_journal.json drift.
 *
 * The production migrator only applies journal tags; disk-only SQL files are
 * silently skipped. This script mirrors tests/unit/database/migration-journal.test.ts
 * and adds tag / ordering guards.
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const TAG_PATTERN = /^\d{4}_[a-z0-9_]+$/;

function fail(message, detail) {
  console.error(message, detail ?? '');
  process.exit(1);
}

const journal = JSON.parse(readFileSync(path.join(root, 'meta', '_journal.json'), 'utf8'));
const entries = journal.entries ?? [];

if (!Array.isArray(entries) || entries.length === 0) {
  fail('migration journal is empty');
}

const allSql = readdirSync(root)
  .filter((entry) => entry.endsWith('.sql'))
  .map((entry) => entry.replace(/\.sql$/, ''));

/**
 * SQL files that are intentionally not in the journal yet.
 * Empty: every current migration file is journaled. A new disk-only SQL file
 * fails this gate until it is journaled or explicitly listed here after review.
 */
const PENDING_OFF_JOURNAL = new Set();

const tags = entries.map((entry) => entry.tag);
const sqlSet = new Set(allSql);

for (const tag of tags) {
  if (!sqlSet.has(tag)) {
    fail('journal tag missing SQL file on disk', tag);
  }
}

const unexpectedDisk = allSql.filter((tag) => !tags.includes(tag) && !PENDING_OFF_JOURNAL.has(tag));
if (unexpectedDisk.length > 0) {
  fail('SQL on disk without journal entry (not in pending allowlist)', unexpectedDisk);
}

const pendingMissing = [...PENDING_OFF_JOURNAL].filter((tag) => !sqlSet.has(tag));
if (pendingMissing.length > 0) {
  fail('expected pending Gate B SQL missing on disk', pendingMissing);
}

const idxs = entries.map((entry) => entry.idx);
const expectedIdx = entries.map((_, index) => index);
if (JSON.stringify(idxs) !== JSON.stringify(expectedIdx)) {
  fail('journal idx must be consecutive from 0', { idxs });
}

const prefixes = new Set();
let previousWhen = -Infinity;

for (const entry of entries) {
  if (typeof entry.tag !== 'string' || !TAG_PATTERN.test(entry.tag)) {
    fail('invalid journal tag', entry.tag);
  }
  const prefix = entry.tag.slice(0, 4);
  if (prefixes.has(prefix)) {
    fail('duplicate migration numeric prefix', prefix);
  }
  prefixes.add(prefix);

  if (typeof entry.when !== 'number' || !(entry.when > previousWhen)) {
    fail('journal `when` must be strictly increasing', { tag: entry.tag, when: entry.when });
  }
  previousWhen = entry.when;
}

console.log('journal parity ok', {
  journal: tags.length,
  pendingOffJournal: PENDING_OFF_JOURNAL.size,
  lastJournalTag: tags[tags.length - 1],
});
