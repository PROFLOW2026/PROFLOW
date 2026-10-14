/**
 * READ-ONLY duplication audit — org 8ef9e353...
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';

function loadUrl() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

const sql = postgres(loadUrl(), { max: 1 });

const allExpenses2026 = await sql`
  SELECT e.id, e.expense_date, e.status, e.description, e.supplier_name, e.vendor_id,
         v.name AS vendor_name, e.project_id, p.name AS project_name,
         e.net_amount::text AS net_amount, e.gross_amount::text AS gross_amount,
         e.tax_amount::text AS tax_amount, e.payment_status, e.paid_at, e.paid_gross_amount::text,
         e.due_date, e.source_recurring_draft_id, e.recurring_template_id,
         e.voids_expense_id, e.adjusts_expense_id, e.finalized_at,
         e.created_at, e.updated_at, e.created_by_user_id,
         e.allocation_intent, e.installment_count, e.is_recurring_template,
         cc.key AS category_key, cc.name AS category_name, e.cost_family,
         e.classification_status, e.notes
  FROM expenses e
  LEFT JOIN vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
  LEFT JOIN projects p ON p.id = e.project_id AND p.organization_id = e.organization_id
  LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id AND cc.organization_id = e.organization_id
  WHERE e.organization_id = ${ORG}::uuid
    AND e.archived_at IS NULL
    AND (
      e.expense_date >= '2026-01-01' AND e.expense_date <= '2026-12-31'
      OR e.created_at >= '2026-01-01'::timestamptz
    )
  ORDER BY e.expense_date, e.created_at, e.id`;

const jan1_800 = await sql`
  SELECT e.*, v.name AS vendor_name, cc.key AS category_key
  FROM expenses e
  LEFT JOIN vendors v ON v.id = e.vendor_id AND e.organization_id = v.organization_id
  LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
    AND e.expense_date = '2026-01-01'
    AND ABS(e.net_amount::numeric - 800) < 0.01
  ORDER BY e.created_at`;

const feb_hatahatim = await sql`
  SELECT e.id, e.expense_date, e.status, e.description, e.supplier_name, v.name AS vendor_name,
         e.net_amount::text, e.gross_amount::text, e.payment_status, e.paid_at,
         e.project_id, p.name AS project_name, e.created_at, e.updated_at,
         e.source_recurring_draft_id, e.voids_expense_id, cc.key AS category_key
  FROM expenses e
  LEFT JOIN vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
  LEFT JOIN projects p ON p.id = e.project_id
  LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
  WHERE e.organization_id = ${ORG}::uuid AND e.archived_at IS NULL
    AND e.expense_date >= '2026-02-01' AND e.expense_date <= '2026-02-28'
    AND (
      lower(coalesce(e.supplier_name,'')) LIKE '%תותח%'
      OR lower(coalesce(v.name,'')) LIKE '%תותח%'
      OR ABS(e.net_amount::numeric - 28050) < 0.01
    )
  ORDER BY e.expense_date, e.id`;

const apMatches = await sql`
  SELECT m.id, m.expense_id, m.ap_bill_id, m.status, m.matched_amount::text
  FROM ap_po_matches m WHERE m.organization_id = ${ORG}::uuid AND m.expense_id IS NOT NULL`;

const recurringLinks = await sql`
  SELECT r.id AS run_id, r.generated_entity_id AS expense_id, r.occurrence_year_month,
         r.run_date, r.generated_entity_type, d.title AS draft_title, d.draft_kind
  FROM recurring_financial_draft_runs r
  LEFT JOIN recurring_financial_drafts d ON d.id = r.draft_id
  WHERE r.organization_id = ${ORG}::uuid AND r.generated_entity_type = 'expense'
    AND r.occurrence_year_month >= '2026-01' AND r.occurrence_year_month <= '2026-10'`;

const _allocations = await sql`
  SELECT ea.expense_id, ea.target_type, ea.project_id, ea.amount::text, ea.method
  FROM expense_allocations ea WHERE ea.organization_id = ${ORG}::uuid`;

const auditEvents = await sql`
  SELECT id, entity_id, action, actor_user_id, created_at,
         before, after, metadata
  FROM audit_events
  WHERE organization_id = ${ORG}::uuid
    AND entity_type = 'expense'
    AND created_at >= '2026-01-01'::timestamptz
  ORDER BY created_at DESC
  LIMIT 1000`;

const voidChains = await sql`
  SELECT id, voids_expense_id, adjusts_expense_id, status, net_amount::text, expense_date
  FROM expenses
  WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL
    AND (voids_expense_id IS NOT NULL OR adjusts_expense_id IS NOT NULL)`;

const duplicateCandidates = await sql`
  WITH base AS (
    SELECT id, expense_date, status, supplier_name, vendor_id, net_amount::numeric AS net,
           gross_amount::numeric AS gross, description, project_id, payment_status,
           created_at, voids_expense_id
    FROM expenses
    WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL AND status != 'void'
      AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'
  )
  SELECT a.id AS id_a, b.id AS id_b,
         a.expense_date AS date_a, b.expense_date AS date_b,
         a.net, a.supplier_name, a.description AS desc_a, b.description AS desc_b,
         a.status AS status_a, b.status AS status_b,
         a.payment_status AS pay_a, b.payment_status AS pay_b,
         a.project_id AS proj_a, b.project_id AS proj_b
  FROM base a
  JOIN base b ON a.id < b.id
    AND a.net = b.net
    AND ABS(a.expense_date - b.expense_date) <= 7
    AND (
      (a.vendor_id IS NOT NULL AND a.vendor_id = b.vendor_id)
      OR (nullif(trim(a.supplier_name),'') IS NOT NULL AND lower(trim(a.supplier_name)) = lower(trim(b.supplier_name)))
      OR (a.vendor_id IS NULL AND b.vendor_id IS NULL AND nullif(trim(a.supplier_name),'') IS NULL)
    )
  ORDER BY a.expense_date, a.net DESC`;

const statusCounts = await sql`
  SELECT status, COUNT(*)::int AS cnt
  FROM expenses WHERE organization_id = ${ORG}::uuid AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'
  GROUP BY status ORDER BY status`;

await sql.end();

console.log(
  JSON.stringify(
    {
      meta: { org: ORG, at: new Date().toISOString() },
      statusCounts,
      totalRows2026: allExpenses2026.length,
      jan1_800,
      feb_hatahatim,
      duplicateCandidates,
      apMatches,
      recurringLinksCount: recurringLinks.length,
      recurringLinks,
      voidChains,
      auditEventsCount: auditEvents.length,
    },
    null,
    2,
  ),
);
