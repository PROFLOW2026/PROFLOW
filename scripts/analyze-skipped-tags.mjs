import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();
dotenv.config({ path: '.env.local', override: true });

const tags = [
  '0001_rls_security',
  '0067_time_entry_cost_snapshot_fill',
  '0081_payment_instruments',
  '0153_quote_text_blocks_rls',
  '0181_owner_bms_installment_payment_backfill',
];

const MIGRATIONS_DIR = path.resolve('drizzle/migrations');
const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
const whenByTag = new Map(journal.entries.map((e) => [e.tag, e.when]));

const sql = postgres(process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL, {
  max: 1,
  prepare: false,
});
const applied = await sql`
  SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC
`;
const appliedHashes = new Set(applied.map((r) => r.hash));

const rows = tags.map((tag) => {
  const content = readFileSync(path.join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
  const hash = createHash('sha256').update(content).digest('hex');
  const match = appliedHashes.has(hash);
  const sameWhen = applied.filter((r) => Number(r.created_at) === whenByTag.get(tag));
  return { tag, when: whenByTag.get(tag), hash, hashInLedger: match, ledgerRowsWithSameWhen: sameWhen };
});

console.log(JSON.stringify({ appliedCount: applied.length, rows }, null, 2));
await sql.end();
