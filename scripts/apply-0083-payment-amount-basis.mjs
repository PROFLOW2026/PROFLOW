/**
 * Apply migration 0083_payment_amount_basis.sql to the live database.
 * Owner-approved for collection semantics release.
 */
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });

const dbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!dbUrl || /127\.0\.0\.1|localhost/.test(dbUrl)) {
  throw new Error('Real DIRECT_DATABASE_URL / DATABASE_URL required');
}

const sqlPath = path.join(process.cwd(), 'drizzle/migrations/0083_payment_amount_basis.sql');
const migrationSql = fs.readFileSync(sqlPath, 'utf8');

const sql = postgres(dbUrl, { max: 1 });

try {
  const before = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'amount_basis'
  `;
  if (before.length > 0) {
    console.log(JSON.stringify({ status: 'already_applied', column: 'amount_basis' }));
  } else {
    await sql.unsafe(migrationSql);
    console.log(JSON.stringify({ status: 'applied', migration: '0083_payment_amount_basis' }));
  }

  const legacy = await sql`
    SELECT id, amount_basis
    FROM payments
    WHERE id IN (
      'd70fd7db-334a-47b2-9db9-1d991692d938',
      'c6f72c76-b2a8-4a8a-9b50-1f4d54120bd8',
      'fb9a0d05-5d12-4cd7-a6f0-a477db1e0a3c',
      '2b1970a2-e344-45f8-a78d-c76b12be23af',
      '8c9abbdd-2dfd-4cf4-853e-d25992f36d7e',
      '27256611-f188-4b76-9a9a-945571fa09a9',
      '8caf579d-d1a5-4d80-adb7-5096ee3851ff',
      '855503f4-6e89-4386-a91a-41d686cebc28',
      '2157d3c7-ca20-4624-bc2d-7ec4d5200336'
    )
  `;

  const missingBasis = await sql`
    SELECT count(*)::int AS n
    FROM payments
    WHERE status = 'recorded' AND amount_basis IS NULL
  `;

  console.log(
    JSON.stringify(
      {
        legacyNetClassified: legacy.filter((r) => r.amount_basis === 'net').length,
        legacyTotal: legacy.length,
        activeMissingBasis: missingBasis[0]?.n ?? null,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
