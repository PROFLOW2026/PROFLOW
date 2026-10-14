/**
 * Follow-up READ-ONLY checks from subagents 2–5 on main org.
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const orgId = process.env.AUDIT_ORG_ID ?? 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const sql = postgres(url, { max: 1 });

const out = { orgId, at: new Date().toISOString() };

// Agent 2 — 3D / 3E
out.emc_time_snapshot_violation = await sql`
  SELECT emc.id, e.name, emc.year_month, emc.status, emc.recognition_source, emc.known_amount
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id AND e.organization_id = emc.organization_id
  WHERE emc.organization_id = ${orgId}
    AND emc.status IN ('applied', 'closed')
    AND emc.recognition_source = 'time_snapshot'
  LIMIT 20`;

out.monthly_allocated_without_applied_run = await sql`
  SELECT emc.id, e.name, emc.year_month, emc.known_amount
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id AND e.organization_id = emc.organization_id
  WHERE emc.organization_id = ${orgId}
    AND emc.status IN ('applied', 'closed')
    AND emc.recognition_source = 'monthly_allocated'
    AND NOT EXISTS (
      SELECT 1 FROM labor_allocation_runs lar
      WHERE lar.employee_month_cost_id = emc.id
        AND lar.organization_id = emc.organization_id
        AND lar.status = 'applied'
    )
  LIMIT 20`;

// Agent 3 — A3 double-count exposure (simplified)
out.expense_double_count_a3 = await sql`
  WITH direct AS (
    SELECT e.id AS expense_id, e.project_id, e.net_amount::numeric AS amount
    FROM expenses e
    WHERE e.organization_id = ${orgId}
      AND e.archived_at IS NULL AND e.status = 'finalized'
      AND COALESCE(e.inventory_stock_purchase, false) = false
      AND e.project_id IS NOT NULL
  ),
  alloc AS (
    SELECT e.id AS expense_id, ea.project_id, ea.amount::numeric AS amount
    FROM expense_allocations ea
    JOIN expenses e ON e.id = ea.expense_id AND e.organization_id = ea.organization_id
    WHERE ea.organization_id = ${orgId}
      AND ea.target_type = 'project' AND ea.project_id IS NOT NULL
      AND e.archived_at IS NULL AND e.status = 'finalized'
      AND COALESCE(e.inventory_stock_purchase, false) = false
  ),
  combined AS (
    SELECT expense_id, project_id, amount, 'direct' AS src FROM direct
    UNION ALL
    SELECT expense_id, project_id, amount, 'alloc' AS src FROM alloc
  )
  SELECT c.project_id, c.expense_id,
         COUNT(DISTINCT c.src) AS sources,
         SUM(c.amount) AS composed,
         MAX(e.net_amount::numeric) AS expense_net_once,
         SUM(c.amount) - MAX(e.net_amount::numeric) AS excess
  FROM combined c
  JOIN expenses e ON e.id = c.expense_id
  GROUP BY c.project_id, c.expense_id
  HAVING COUNT(DISTINCT c.src) > 1
     AND SUM(c.amount) > MAX(e.net_amount::numeric) + 0.01
  LIMIT 30`;

out.expense_ap_overlap_b5_count = await sql`
  SELECT COUNT(*)::int AS heuristic_unlinked_pairs
  FROM expenses e
  INNER JOIN ap_bills b
    ON b.organization_id = e.organization_id AND b.vendor_id = e.vendor_id
  WHERE e.organization_id = ${orgId}
    AND e.archived_at IS NULL AND e.status = 'finalized'
    AND COALESCE(e.inventory_stock_purchase, false) = false
    AND e.vendor_id IS NOT NULL
    AND b.archived_at IS NULL
    AND b.status IN ('open', 'partially_matched', 'matched')
    AND ABS(e.net_amount::numeric - b.net_amount::numeric) <= GREATEST(5, 0.01 * b.net_amount::numeric)
    AND ABS(e.expense_date::date - COALESCE(b.bill_date::date, e.expense_date::date)) <= 45
    AND NOT EXISTS (
      SELECT 1 FROM ap_po_matches m
      WHERE m.organization_id = e.organization_id AND m.status = 'accepted'
        AND m.expense_id = e.id AND m.ap_bill_id = b.id
    )`;

out.agent3_summary = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM expenses e
     WHERE e.organization_id = ${orgId} AND e.archived_at IS NULL AND e.status = 'finalized') AS finalized_expenses,
    (SELECT COUNT(*)::int FROM ap_bills b
     WHERE b.organization_id = ${orgId} AND b.archived_at IS NULL
       AND b.status IN ('open','partially_matched','matched')) AS recognized_ap_bills,
    (SELECT COUNT(*)::int FROM ap_po_matches m
     WHERE m.organization_id = ${orgId} AND m.status = 'accepted') AS accepted_matches`;

// Agent 4
out.ap_payments_without_application = await sql`
  SELECT COUNT(*)::int AS cnt
  FROM ap_payments p
  WHERE p.organization_id = ${orgId}
    AND p.status = 'recorded'
    AND NOT EXISTS (
      SELECT 1 FROM ap_payment_applications a
      WHERE a.ap_payment_id = p.id AND a.organization_id = p.organization_id
    )`;

out.payroll_paid_shape_violations = await sql`
  SELECT COUNT(*)::int AS cnt
  FROM employee_payroll_payments pp
  WHERE pp.organization_id = ${orgId}
    AND pp.payment_status = 'paid'
    AND (pp.paid_amount IS NULL OR pp.paid_at IS NULL OR pp.payment_confirmation_source IS NULL)`;

// Agent 5 — margin snapshots current month
const ym = '2026-09';
out.margin_snapshots_sep = await sql`
  SELECT COUNT(*)::int AS snapshot_rows,
         COALESCE(SUM(actual_cost::numeric), 0) AS sum_actual_cost,
         COALESCE(SUM(actual_margin::numeric), 0) AS sum_margin
  FROM project_margin_snapshots
  WHERE organization_id = ${orgId} AND year_month = ${ym}`;

out.labor_monthly_allocated_lines = await sql`
  SELECT COALESCE(SUM(larl.amount::numeric), 0) AS labor_allocated_to_projects
  FROM employee_month_costs emc
  JOIN labor_allocation_runs lar
    ON lar.employee_month_cost_id = emc.id AND lar.organization_id = emc.organization_id AND lar.status = 'applied'
  JOIN labor_allocation_run_lines larl
    ON larl.labor_allocation_run_id = lar.id AND larl.organization_id = lar.organization_id
  WHERE emc.organization_id = ${orgId}
    AND emc.year_month = ${ym}
    AND emc.status IN ('applied','closed')`;

console.log(JSON.stringify(out, null, 2));
await sql.end();
