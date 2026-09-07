/**
 * Remove the 6 proven invented payroll rows (dry-run unless EXECUTE=1).
 * Raw postgres — does NOT touch attendance source data.
 */
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: '.env.local', override: true });

const PROD_ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const EMPLOYEE_ID = '4e742d25-03ee-49e7-a45e-15a545bfe3b4';
const BATCH_TS = '2026-09-06 23:12:32+00';
const INVENTED_MONTHS = ['2026-01', '2026-02', '2026-05', '2026-06', '2026-07', '2026-09'];
const PRESERVE_MONTHS = ['2026-03', '2026-04', '2026-08'];
const EXECUTE = process.env.EXECUTE === '1';

const dbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(JSON.stringify({ error: 'missing DATABASE_URL' }));
  process.exit(1);
}

const sql = postgres(dbUrl);

const candidates = await sql`
  SELECT id, year_month, expected_amount, payment_status, paid_at, payment_confirmation_source, created_at
  FROM employee_payroll_payments
  WHERE organization_id = ${PROD_ORG}
    AND employee_id = ${EMPLOYEE_ID}
    AND voided_at IS NULL
    AND year_month IN ('2026-01','2026-02','2026-05','2026-06','2026-07','2026-09')
    AND created_at >= ${BATCH_TS}::timestamptz
    AND created_at < (${BATCH_TS})::timestamptz + interval '1 second'
    AND paid_at IS NULL
    AND payment_confirmation_source IS NULL
  ORDER BY year_month
`;

if (candidates.length !== 6) {
  console.error(
    JSON.stringify({ error: 'dry_run_mismatch', expected: 6, found: candidates.length, candidates }, null, 2),
  );
  await sql.end();
  process.exit(1);
}

if (!EXECUTE) {
  console.log(JSON.stringify({ dryRun: true, execute: false, rowsToDelete: candidates }, null, 2));
  await sql.end();
  process.exit(0);
}

const ids = candidates.map((r) => r.id);
await sql`
  DELETE FROM employee_payroll_payments
  WHERE organization_id = ${PROD_ORG}
    AND id = ANY(${ids})
`;

const remaining = await sql`
  SELECT id, year_month, expected_amount, payment_status, paid_at, payment_confirmation_source, created_at
  FROM employee_payroll_payments
  WHERE organization_id = ${PROD_ORG}
    AND employee_id = ${EMPLOYEE_ID}
    AND voided_at IS NULL
    AND year_month LIKE '2026-%'
  ORDER BY year_month
`;

const inventedAfter = remaining.filter((r) => INVENTED_MONTHS.includes(r.year_month));
const preserved = remaining.filter((r) => PRESERVE_MONTHS.includes(r.year_month));

console.log(
  JSON.stringify(
    {
      deleted: ids.length,
      remainingCount: remaining.length,
      inventedAfter: inventedAfter.length,
      preservedMonths: preserved.map((r) => r.year_month),
      remaining,
    },
    null,
    2,
  ),
);

await sql.end();

if (inventedAfter.length > 0 || preserved.length !== PRESERVE_MONTHS.length) {
  process.exit(1);
}
