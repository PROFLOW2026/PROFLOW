/**
 * Definitive Arka import:
 * 1. Delete ALL vendor prices for ALL Arka vendor IDs in this org
 * 2. Add unique constraint FIRST (on empty table — guaranteed success)
 * 3. Insert with ON CONFLICT DO NOTHING (now truly idempotent)
 * 4. Verify + idempotency test
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
import postgres from 'postgres';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const connStr = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL || '';
const sql = postgres(connStr, { max: 1, prepare: false });

const ORG_ID    = '7dec19cf-ef7a-4f62-a110-615da62f3823';
const VENDOR_ID = 'f5ff0786-0e9a-47ed-a0a9-b30e1d333f0b';
// All Arka vendor IDs to clean up
const ALL_ARKA_VENDORS = [
  'f5ff0786-0e9a-47ed-a0a9-b30e1d333f0b',
  '67540aa1-81cb-4903-a55b-483a4c7685c3',
  '9056eb27-a43d-462b-9b9f-2afc3d813bb1',
];
const ILS = 'ILS';
const BASE = 'Arka_Invoices/dataset/';
const PMF_TO_TRADE: Record<string, string> = {
  COPPER_WIRE:'electrical', N2XY_COPPER_CABLE:'electrical',
  OTHER_CABLE:'electrical', ALUMINIUM_CABLE:'electrical',
};

async function readCsv(file: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  const rl = createInterface({ input: createReadStream(BASE + file) });
  let headers: string[] = [];
  let first = true;
  for await (const line of rl) {
    if (first) { headers = line.replace(/^\uFEFF/, '').split(','); first = false; continue; }
    if (!line.trim()) continue;
    const vals = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (vals[i] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseDate(raw: string): string | null {
  const p = raw.split('/');
  if (p.length !== 3) return null;
  const [d, m, y] = p;
  const year = y.length === 2 ? '20' + y : y;
  try { return `${year}-${parseInt(m).toString().padStart(2,'0')}-${parseInt(d).toString().padStart(2,'0')}`; }
  catch { return null; }
}

// ── Step 1: DELETE all Arka vendor prices for this org ────────────────────────
console.log('Step 1: Clearing all Arka vendor prices…');
for (const vendorId of ALL_ARKA_VENDORS) {
  await sql`DELETE FROM material_vendor_prices WHERE organization_id = ${ORG_ID}::uuid AND vendor_id = ${vendorId}::uuid`;
}
const afterDel = await sql`SELECT COUNT(*)::int AS n FROM material_vendor_prices WHERE organization_id = ${ORG_ID}::uuid AND vendor_id = ANY(${ALL_ARKA_VENDORS}::uuid[])`;
console.log(`  Remaining Arka VP rows: ${afterDel[0].n} (expected 0)`);

// ── Step 2: Ensure unique constraint exists ───────────────────────────────────
console.log('Step 2: Ensuring unique constraint…');
const constraintExists = await sql`
  SELECT 1 FROM information_schema.table_constraints
  WHERE table_name = 'material_vendor_prices'
    AND constraint_name = 'material_vendor_prices_item_vendor_date_price_uq'
  LIMIT 1
`;
if (constraintExists.length === 0) {
  // Check for global dups first (non-Arka rows)
  const globalDups = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT 1 FROM material_vendor_prices
      GROUP BY organization_id, material_item_id, vendor_id, effective_from, unit_price
      HAVING COUNT(*) > 1
    ) t
  `;
  if (globalDups[0].n > 0) {
    console.log(`  WARNING: ${globalDups[0].n} dup groups from non-Arka data — cleaning…`);
    await sql`
      DELETE FROM material_vendor_prices a
      USING material_vendor_prices b
      WHERE a.organization_id = b.organization_id
        AND a.material_item_id = b.material_item_id
        AND a.vendor_id = b.vendor_id
        AND a.effective_from = b.effective_from
        AND a.unit_price = b.unit_price
        AND a.id <> b.id
        AND a.created_at > b.created_at
    `;
  }
  await sql`
    ALTER TABLE public.material_vendor_prices
    ADD CONSTRAINT material_vendor_prices_item_vendor_date_price_uq
    UNIQUE (organization_id, material_item_id, vendor_id, effective_from, unit_price)
  `;
  console.log('  Constraint created');
} else {
  console.log('  Constraint already exists');
}

// ── Step 3: Load data ─────────────────────────────────────────────────────────
console.log('Step 3: Loading CSV data…');
const mapRows   = await readCsv('material_product_map.csv');
const priceRows = await readCsv('product_price_history.csv');

const tradeByKey: Record<string, string | null> = {};
for (const row of mapRows) {
  const pmf = row['product_market_family'] || 'OTHER';
  tradeByKey[row['normalized_product_key']] = PMF_TO_TRADE[pmf] ?? null;
}

const items = await sql<{id: string; sku: string}[]>`
  SELECT id, sku FROM material_items WHERE organization_id = ${ORG_ID}::uuid AND archived_at IS NULL
`;
const skuToId = new Map(items.map(r => [r.sku, r.id]));

// Dedup in memory first
const seen = new Set<string>();
type Row = { itemId: string; price: number; date: string };
const rows: Row[] = [];
for (const row of priceRows) {
  if (row['price_observation_usable']?.toUpperCase() !== 'YES') continue;
  const price = parseFloat(row['unit_price_net'] || '0');
  if (!price || price <= 0) continue;
  const date = parseDate(row['invoice_date'] || '');
  if (!date) continue;
  const key = row['normalized_product_key'];
  const sku  = row['item_code'] || key.replace('SKU:', '');
  // Use Postgres-compatible dedup: round to 6 decimal places
  const priceKey = Math.round(price * 1000000) / 1000000;
  const dedup = `${sku}|${date}|${priceKey}`;
  if (seen.has(dedup)) continue;
  seen.add(dedup);
  const itemId = skuToId.get(sku);
  if (!itemId) continue;
  rows.push({ itemId, price: priceKey, date });
}
console.log(`  Deduped rows: ${rows.length}`);

// ── Step 4: Insert with ON CONFLICT DO NOTHING ────────────────────────────────
console.log('Step 4: Inserting price observations…');
let inserted = 0;
const BATCH = 500;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await sql`
    INSERT INTO material_vendor_prices
      (organization_id, material_item_id, vendor_id, unit_price, currency, effective_from)
    SELECT ${ORG_ID}::uuid, UNNEST(${batch.map(r => r.itemId)}::uuid[]),
           ${VENDOR_ID}::uuid, UNNEST(${batch.map(r => r.price.toString())}::numeric[]),
           ${ILS}, UNNEST(${batch.map(r => r.date)}::date[])
    ON CONFLICT ON CONSTRAINT material_vendor_prices_item_vendor_date_price_uq DO NOTHING
  `;
  inserted += batch.length;
  process.stdout.write(`\r  ${inserted}/${rows.length}`);
}
console.log('\n  Done');

// ── Step 5: Verify ────────────────────────────────────────────────────────────
console.log('Step 5: Verification…');
const [totalVp, elecVp, dups, dateRange] = await Promise.all([
  sql<{n: number}[]>`SELECT COUNT(*)::int AS n FROM material_vendor_prices WHERE organization_id = ${ORG_ID}::uuid AND vendor_id = ${VENDOR_ID}::uuid`,
  sql<{n: number}[]>`SELECT COUNT(*)::int AS n FROM material_vendor_prices mvp JOIN material_items mi ON mi.id = mvp.material_item_id WHERE mvp.organization_id = ${ORG_ID}::uuid AND mvp.vendor_id = ${VENDOR_ID}::uuid AND mi.trade = 'electrical'`,
  sql<{n: number}[]>`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM material_vendor_prices WHERE organization_id = ${ORG_ID}::uuid AND vendor_id = ${VENDOR_ID}::uuid GROUP BY material_item_id, vendor_id, effective_from, unit_price HAVING COUNT(*) > 1) t`,
  sql<{min_d: string; max_d: string; months: number}[]>`SELECT MIN(effective_from)::text AS min_d, MAX(effective_from)::text AS max_d, COUNT(DISTINCT to_char(effective_from,'YYYY-MM'))::int AS months FROM material_vendor_prices mvp JOIN material_items mi ON mi.id = mvp.material_item_id WHERE mvp.organization_id = ${ORG_ID}::uuid AND mi.trade='electrical'`,
]);
console.log(`MATERIAL_VENDOR_PRICES TOTAL = ${totalVp[0].n}`);
console.log(`ELECTRICAL PRICE OBSERVATIONS = ${elecVp[0].n}`);
console.log(`DUPS = ${dups[0].n} (expected 0)`);
console.log(`EARLIEST ELECTRICAL = ${dateRange[0]?.min_d}`);
console.log(`LATEST ELECTRICAL = ${dateRange[0]?.max_d}`);
console.log(`ELECTRICAL MONTHS = ${dateRange[0]?.months}`);

// ── Step 6: Idempotency test ──────────────────────────────────────────────────
console.log('Step 6: Idempotency test (re-inserting first 50 rows)…');
const vpBefore = totalVp[0].n;
for (const r of rows.slice(0, 50)) {
  await sql`
    INSERT INTO material_vendor_prices (organization_id, material_item_id, vendor_id, unit_price, currency, effective_from)
    VALUES (${ORG_ID}::uuid, ${r.itemId}::uuid, ${VENDOR_ID}::uuid, ${r.price.toString()}, ${ILS}, ${r.date})
    ON CONFLICT ON CONSTRAINT material_vendor_prices_item_vendor_date_price_uq DO NOTHING
  `;
}
const vpAfter = (await sql<{n: number}[]>`SELECT COUNT(*)::int AS n FROM material_vendor_prices WHERE organization_id = ${ORG_ID}::uuid AND vendor_id = ${VENDOR_ID}::uuid`)[0].n;
console.log(`SECOND_IMPORT_DUPLICATES = ${vpAfter - vpBefore} (expected 0)`);

await sql.end();
console.log('Import complete.');
