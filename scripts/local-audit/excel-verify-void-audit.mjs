import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const VOID_IDS = [
  '5642f1de-b5f7-474d-888a-8686b88b2167',
  '7d127420-d37a-469a-97b5-702389de4fee',
  '2807943d-8fcb-41e5-989d-3ee46982f8b0',
  'c16d5480-8422-43b4-9a24-68bc947e8314',
  'e67a342d-bf56-4a79-9b2f-6a77689cf9a5',
  'b59035cf-fe06-49a6-9cb3-97459bed9b4f',
  '989cc273-cd8e-4932-b205-6869d5154b02',
];

const url = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  .match(/DATABASE_URL=(.+)/)[1]
  .trim()
  .replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const statuses = await sql`
  SELECT id, status FROM expenses
  WHERE organization_id = ${ORG}::uuid AND id = ANY(${VOID_IDS}::uuid[])`;

const audits = await sql`
  SELECT entity_id, action, created_at, before, after
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid
    AND entity_type = 'expense'
    AND entity_id = ANY(${VOID_IDS}::uuid[])
    AND action ILIKE '%void%'
  ORDER BY entity_id, created_at`;

const finalizedCount = await sql`
  SELECT count(*)::int AS cnt
  FROM expenses
  WHERE organization_id = ${ORG}::uuid
    AND archived_at IS NULL
    AND expense_date >= '2026-01-01'
    AND expense_date < '2026-11-01'
    AND status = 'finalized'`;

const recognizedByMonth = await sql`
  SELECT to_char(expense_date, 'YYYY-MM') AS ym,
         sum(net_amount::numeric)::text AS recognized_net,
         count(*)::int AS cnt
  FROM expenses
  WHERE organization_id = ${ORG}::uuid
    AND archived_at IS NULL
    AND expense_date >= '2026-01-01'
    AND expense_date < '2026-11-01'
    AND status = 'finalized'
  GROUP BY 1
  ORDER BY 1`;

console.log(
  JSON.stringify(
    {
      allVoid: statuses.every((r) => r.status === 'void'),
      statuses,
      voidAuditCount: audits.length,
      audits: audits.map((a) => ({
        id: a.entity_id,
        action: a.action,
        at: a.created_at,
      })),
      finalizedCount2026: finalizedCount[0].cnt,
      recognizedByMonth,
    },
    null,
    2,
  ),
);
await sql.end();
