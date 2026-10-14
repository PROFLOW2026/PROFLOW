import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const url = raw.match(/DATABASE_URL=(.+)/)[1].trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const ids = [
  '5642f1de-b5f7-474d-888a-8686b88b2167',
  'caf50207-9872-46c6-acc6-42608635e324',
  '2807943d-8fcb-41e5-989d-3ee46982f8b0',
  '52858ea4-9109-4331-8a3d-c7b67c83cfd5',
];

const audit = await sql`
  SELECT entity_id, action, created_at, before, after
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid AND entity_id = ANY(${ids}::uuid[])
  ORDER BY created_at`;

const voidLink = await sql`
  SELECT id, status, voids_expense_id, adjusts_expense_id, net_amount::text, expense_date, project_id, notes
  FROM expenses WHERE id = ANY(${ids}::uuid[])`;

const duplicateCandidatesFull = await sql`
  WITH base AS (
    SELECT id, expense_date, status, supplier_name, vendor_id, net_amount::numeric AS net,
           description, project_id, payment_status
    FROM expenses
    WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL AND status != 'void'
      AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'
  )
  SELECT a.id AS id_a, b.id AS id_b, a.expense_date::text AS date_a, b.expense_date::text AS date_b,
         a.net::text, a.supplier_name, a.status AS status_a, b.status AS status_b,
         a.project_id AS proj_a, b.project_id AS proj_b, a.description AS desc_a, b.description AS desc_b
  FROM base a
  JOIN base b ON a.id < b.id AND a.net = b.net AND ABS(a.expense_date - b.expense_date) <= 7
    AND (
      (a.vendor_id IS NOT NULL AND a.vendor_id = b.vendor_id)
      OR (nullif(trim(a.supplier_name), '') IS NOT NULL AND lower(trim(a.supplier_name)) = lower(trim(b.supplier_name)))
      OR (a.vendor_id IS NULL AND b.vendor_id IS NULL AND nullif(trim(a.supplier_name), '') IS NULL)
    )
  ORDER BY a.expense_date`;

const recognitionByMonth = await sql`
  SELECT to_char(expense_date, 'YYYY-MM') AS ym,
         SUM(CASE WHEN status = 'finalized' THEN net_amount::numeric ELSE 0 END) AS recognized_net,
         SUM(CASE WHEN status = 'void' THEN net_amount::numeric ELSE 0 END) AS void_net,
         COUNT(*) FILTER (WHERE status = 'finalized') AS finalized_cnt,
         COUNT(*) FILTER (WHERE status = 'void') AS void_cnt,
         COUNT(*) AS all_cnt
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'
  GROUP BY 1 ORDER BY 1`;

const voidsPointing = await sql`
  SELECT id, status, voids_expense_id, net_amount::text, expense_date, supplier_name
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL AND voids_expense_id IS NOT NULL`;

const excelVsProd = {
  note: 'Excel lists void rows as expense lines — see EXPORT PRESENTATION not RECOGNITION DUPLICATE',
};

writeFileSync(
  resolve(process.cwd(), '.tools/dup-audit-detail.json'),
  JSON.stringify({ audit, voidLink, duplicateCandidatesFull, recognitionByMonth, voidsPointing, excelVsProd }, null, 2),
);
await sql.end();
console.log('ok', duplicateCandidatesFull.length, 'candidate pairs');
