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

const files = readdirSync(root)
  .filter((entry) => entry.endsWith('.sql'))
  .map((entry) => entry.replace(/\.sql$/, ''))
  .sort();

const tags = entries.map((entry) => entry.tag);

if (JSON.stringify(tags) !== JSON.stringify(files)) {
  fail('journal tags must equal sorted SQL basenames', { tags, files });
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

console.log('journal parity ok', { files: files.length, last: files[files.length - 1] });
