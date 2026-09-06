/**
 * Owner recurring validation — read-only report against DATABASE_URL.
 * Works before/after migration 0080 (payment columns optional).
 * Usage: node scripts/verify-recurring-owner-data.mjs
 */
import pg from 'pg';

const SEPTEMBER = '2026-09';
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

const { rows: columnRows } = await client.query(`
  SELECT column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'recurring_financial_drafts'
    AND column_name IN ('payment_confirmation_override', 'recurring_payment_day')
`);
const hasPaymentColumns = columnRows.some((row) => row.column_name === 'payment_confirmation_override');

const { rows: templates } = await client.query(`
  SELECT d.id, d.title, d.frequency, d.status, d.next_run_date,
         d.payload_json->>'vendorId' AS vendor_id
         ${hasPaymentColumns ? ', d.payment_confirmation_override, d.recurring_payment_day' : ''}
  FROM recurring_financial_drafts d
  WHERE d.draft_kind = 'expense'
    AND d.status = 'active'
    AND d.archived_at IS NULL
    AND d.frequency = 'monthly'
  ORDER BY d.title
`);

console.log('\n=== Owner recurring templates (monthly active) ===\n');
console.log(
  '| Template | Recurrence | Existing months | Sep 2026 | Auto/manual | Payment day | Vendor |',
);
console.log('|---|---|---|---|---|---|---|');

let expectedSep = 0;
let actualSep = 0;
let missingBeforeRepair = 0;

for (const template of templates) {
  const { rows: runs } = await client.query(
    `SELECT occurrence_year_month, run_date
     FROM recurring_financial_draft_runs
     WHERE draft_id = $1 AND generated_entity_type = 'expense'
     ORDER BY occurrence_year_month NULLS LAST, run_date`,
    [template.id],
  );
  const months = runs
    .map((run) => run.occurrence_year_month)
    .filter((value) => typeof value === 'string');
  const hasSep = months.includes(SEPTEMBER);
  expectedSep += 1;
  if (hasSep) actualSep += 1;
  else missingBeforeRepair += 1;

  const auto = hasPaymentColumns
    ? template.payment_confirmation_override === 'automatic'
      ? 'automatic'
      : 'manual'
    : 'manual (pre-0080)';
  const paymentDay = hasPaymentColumns ? (template.recurring_payment_day ?? '—') : '—';
  const vendor = template.vendor_id ? 'linked' : 'none';

  console.log(
    `| ${template.title} | monthly | ${months.join(', ') || '—'} | ${hasSep ? 'YES' : 'MISSING'} | ${auto} | ${paymentDay} | ${vendor} |`,
  );
}

const { rows: englishNotes } = await client.query(`
  SELECT count(*)::int AS count
  FROM expenses
  WHERE notes ~ 'Generated from recurring draft'
`);

const { rows: dupes } = await client.query(`
  SELECT draft_id, occurrence_year_month, count(*)::int AS c
  FROM recurring_financial_draft_runs
  WHERE generated_entity_type = 'expense'
    AND occurrence_year_month IS NOT NULL
  GROUP BY draft_id, occurrence_year_month
  HAVING count(*) > 1
`);

console.log('\n=== Summary ===');
console.log(`Migration 0080 payment columns present = ${hasPaymentColumns ? 'YES' : 'NO'}`);
console.log(`Active monthly templates = ${templates.length}`);
console.log(`September 2026 expected = ${expectedSep}`);
console.log(`September 2026 actual = ${actualSep}`);
console.log(`Missing September (before ensure/0080 repair) = ${missingBeforeRepair}`);
console.log(`Duplicate month occurrences = ${dupes.length}`);
console.log(`English system notes remaining = ${englishNotes[0]?.count ?? 0}`);

await client.end();
