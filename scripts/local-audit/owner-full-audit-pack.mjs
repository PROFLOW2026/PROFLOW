/**
 * Full owner-org audit pack Jan-Oct 2026 — SELECT only.
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const pack = { orgId: ORG, generatedAt: new Date().toISOString() };

pack.ownerVerify = await sql`
  SELECT p.email, p.display_name, o.id AS org_id, o.name AS org_name
  FROM profiles p
  JOIN organization_memberships om ON om.user_id = p.id
  JOIN organizations o ON o.id = om.organization_id
  WHERE lower(p.email) = '18eran@gmail.com' AND o.id = ${ORG}::uuid`;

pack.employees = await sql`
  SELECT id, name, status, compensation_class, default_labor_allocation_intent,
         hire_date, end_date
  FROM employees WHERE organization_id = ${ORG} AND archived_at IS NULL ORDER BY name`;

pack.emc_full_matrix = await sql`
  SELECT e.name, e.id AS employee_id, emc.year_month,
         emc.estimated_amount, emc.actual_amount, emc.known_amount, emc.known_quality,
         emc.status, emc.recognition_source, emc.updated_at
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  WHERE emc.organization_id = ${ORG}
    AND emc.status IN ('draft','applied','closed')
    AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
  ORDER BY e.name, emc.year_month`;

pack.emc_duplicate_active = await sql`
  SELECT employee_id, year_month, COUNT(*)::int AS active_rows
  FROM employee_month_costs
  WHERE organization_id = ${ORG}
    AND status IN ('draft','applied','closed')
    AND year_month >= '2026-01' AND year_month <= '2026-10'
  GROUP BY employee_id, year_month
  HAVING COUNT(*) > 1`;

pack.emc_superseded_counts = await sql`
  SELECT year_month, COUNT(*)::int AS superseded_rows
  FROM employee_month_costs
  WHERE organization_id = ${ORG} AND status = 'superseded'
    AND year_month >= '2026-01' AND year_month <= '2026-10'
  GROUP BY year_month ORDER BY year_month`;

pack.payroll_full = await sql`
  SELECT e.name, pp.year_month, pp.expected_amount, pp.paid_amount, pp.payment_status,
         pp.paid_at, pp.due_date, pp.obligation_source, pp.updated_at
  FROM employee_payroll_payments pp
  JOIN employees e ON e.id = pp.employee_id
  WHERE pp.organization_id = ${ORG} AND pp.voided_at IS NULL
    AND pp.year_month >= '2026-01' AND pp.year_month <= '2026-10'
  ORDER BY pp.year_month, e.name`;

pack.labor_conservation = await sql`
  SELECT emc.year_month, e.name,
         emc.known_amount::numeric AS emc_known,
         lar.allocated_amount::numeric AS allocated,
         lar.unallocated_amount::numeric AS unallocated,
         lar.company_only_amount::numeric AS company_only,
         (lar.allocated_amount::numeric + lar.unallocated_amount::numeric + lar.company_only_amount::numeric) AS sum_parts,
         (lar.allocated_amount::numeric + lar.unallocated_amount::numeric + lar.company_only_amount::numeric - emc.known_amount::numeric) AS delta
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  JOIN labor_allocation_runs lar ON lar.employee_month_cost_id = emc.id
    AND lar.organization_id = emc.organization_id AND lar.status = 'applied'
  WHERE emc.organization_id = ${ORG}
    AND emc.status IN ('applied','closed')
    AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
  ORDER BY emc.year_month, e.name`;

pack.time_by_month = await sql`
  SELECT to_char(work_date, 'YYYY-MM') AS ym, approval_status,
         COUNT(*)::int AS entries, SUM(hours::numeric) AS hours
  FROM time_entries
  WHERE organization_id = ${ORG} AND kind = 'project' AND status = 'recorded'
    AND archived_at IS NULL AND work_date >= '2026-01-01' AND work_date <= '2026-10-31'
  GROUP BY 1, 2 ORDER BY 1, 2`;

pack.expenses_by_month = await sql`
  SELECT to_char(expense_date, 'YYYY-MM') AS ym, status,
         COUNT(*)::int AS cnt, SUM(net_amount::numeric) AS sum_net,
         SUM(gross_amount::numeric) AS sum_gross
  FROM expenses
  WHERE organization_id = ${ORG} AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'
  GROUP BY 1, 2 ORDER BY 1, 2`;

pack.expenses_finalized_detail_count = await sql`
  SELECT COUNT(*)::int AS finalized_rows,
         SUM(net_amount::numeric) AS sum_net
  FROM expenses
  WHERE organization_id = ${ORG} AND status = 'finalized' AND archived_at IS NULL
    AND expense_date >= '2026-01-01' AND expense_date <= '2026-10-31'`;

pack.recurring_runs = await sql`
  SELECT r.occurrence_year_month, COUNT(*)::int AS runs,
         SUM(e.gross_amount::numeric) AS sum_gross,
         COUNT(*) FILTER (WHERE e.payment_status = 'paid' OR COALESCE(e.paid_gross_amount,0) >= e.gross_amount)::int AS paid_cnt
  FROM recurring_financial_draft_runs r
  JOIN expenses e ON e.id = r.generated_entity_id AND e.organization_id = r.organization_id
  WHERE r.organization_id = ${ORG} AND r.generated_entity_type = 'expense'
    AND r.occurrence_year_month >= '2026-01' AND r.occurrence_year_month <= '2026-10'
  GROUP BY r.occurrence_year_month ORDER BY 1`;

pack.ap_summary = await sql`
  SELECT status, COUNT(*)::int FROM ap_bills
  WHERE organization_id = ${ORG} AND archived_at IS NULL GROUP BY status`;

pack.committed_costs = await sql`
  SELECT status, COUNT(*)::int, SUM(amount::numeric) AS sum_amt
  FROM committed_costs WHERE organization_id = ${ORG}
  GROUP BY status`;

pack.billing_by_month = await sql`
  SELECT to_char(COALESCE(finalized_at, issue_date), 'YYYY-MM') AS ym,
         COUNT(*)::int AS cnt,
         SUM(subtotal_amount::numeric) AS sum_net,
         SUM(tax_amount::numeric) AS sum_tax
  FROM billing_records
  WHERE organization_id = ${ORG} AND status = 'finalized'
    AND COALESCE(finalized_at, issue_date) >= '2026-01-01'
  GROUP BY 1 ORDER BY 1`;

pack.snapshots_meta = await sql`
  SELECT s.project_id, p.name, s.year_month, s.actual_cost, s.actual_margin,
         s.contract_value, s.captured_at, s.updated_at
  FROM project_margin_snapshots s
  JOIN projects p ON p.id = s.project_id
  WHERE s.organization_id = ${ORG}
    AND s.year_month IN ('2026-09','2026-10')
  ORDER BY s.year_month, p.name`;

pack.general_cost_alloc = await sql`
  SELECT gcm.year_month, SUM(gca.amount::numeric) AS allocated_general
  FROM general_cost_month_allocations gca
  JOIN general_cost_months gcm ON gcm.id = gca.general_cost_month_id
  WHERE gca.organization_id = ${ORG}
    AND gcm.year_month >= '2026-01' AND gcm.year_month <= '2026-10'
  GROUP BY gcm.year_month ORDER BY gcm.year_month`;

const out = resolve(process.cwd(), '.tools/owner-full-audit-pack.json');
writeFileSync(out, JSON.stringify(pack, null, 2), 'utf8');
console.log('Wrote', out, 'employees', pack.employees.length);
await sql.end();
