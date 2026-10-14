/**
 * Full read-only truth pack — owner org only (8ef9e353…)
 */
import postgres from 'postgres';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const orgId = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const sql = postgres(url, { max: 1 });

const report = {
  verifiedOwner: { email: '18eran@gmail.com', orgId, orgName: 'מתח ח.י הנדסת חשמל בע"מ' },
  sections: {},
};

report.sections.emc_range = await sql`
  SELECT MIN(year_month) min_ym, MAX(year_month) max_ym,
         COUNT(*) FILTER (WHERE status IN ('draft','applied','closed')) active_rows
  FROM employee_month_costs WHERE organization_id = ${orgId}`;

report.sections.emc_by_month = await sql`
  SELECT year_month, known_quality, COUNT(*)::int n, SUM(known_amount::numeric) sum_known
  FROM employee_month_costs
  WHERE organization_id = ${orgId} AND status IN ('draft','applied','closed')
  GROUP BY year_month, known_quality ORDER BY year_month, known_quality`;

report.sections.all_actual_emc = await sql`
  SELECT e.name, emc.year_month, emc.estimated_amount, emc.actual_amount, emc.known_amount,
         emc.known_quality, emc.status, emc.recognition_source
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  WHERE emc.organization_id = ${orgId}
    AND emc.status IN ('draft','applied','closed')
    AND emc.known_quality = 'actual'
  ORDER BY emc.year_month DESC, e.name`;

report.sections.eran = await sql`
  SELECT e.id employee_id, e.name, e.compensation_class, e.default_labor_allocation_intent
  FROM employees e
  WHERE e.organization_id = ${orgId} AND e.archived_at IS NULL
    AND (e.name ILIKE '%ערן%' AND e.name ILIKE '%יוסף%')`;

const eranId = report.sections.eran[0]?.employee_id;
if (eranId) {
  report.sections.eran_rates = await sql`
    SELECT valid_from, valid_to, base_rate, burden_percent, rate_unit, estimated_employer_cost
    FROM rate_versions WHERE organization_id = ${orgId} AND employee_id = ${eranId}
    ORDER BY valid_from`;
  report.sections.eran_emc_active = await sql`
    SELECT year_month, known_amount, known_quality, estimated_amount, actual_amount, status, recognition_source
    FROM employee_month_costs
    WHERE organization_id = ${orgId} AND employee_id = ${eranId}
      AND status IN ('draft','applied','closed')
    ORDER BY year_month`;
  report.sections.eran_payroll = await sql`
    SELECT year_month, expected_amount, paid_amount, payment_status, paid_at, obligation_source
    FROM employee_payroll_payments
    WHERE organization_id = ${orgId} AND employee_id = ${eranId} AND voided_at IS NULL
    ORDER BY year_month`;
  report.sections.eran_emc_payroll_gap = await sql`
    SELECT emc.year_month,
           emc.known_amount::numeric emc_known, emc.known_quality,
           p.expected_amount::numeric pay_exp, p.paid_amount::numeric pay_paid,
           emc.known_amount::numeric - COALESCE(p.expected_amount,0)::numeric gap_emc_vs_expected
    FROM employee_month_costs emc
    LEFT JOIN employee_payroll_payments p
      ON p.organization_id = emc.organization_id AND p.employee_id = emc.employee_id
     AND p.year_month = emc.year_month AND p.voided_at IS NULL
    WHERE emc.organization_id = ${orgId} AND emc.employee_id = ${eranId}
      AND emc.status IN ('draft','applied','closed')
    ORDER BY emc.year_month`;
}

report.sections.payroll_emc_gaps_all = await sql`
  SELECT e.name, emc.year_month, emc.known_amount::numeric emc_known, emc.known_quality,
         p.expected_amount::numeric pay_exp, p.paid_amount::numeric pay_paid,
         emc.known_amount::numeric - p.expected_amount::numeric gap
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  JOIN employee_payroll_payments p
    ON p.organization_id = emc.organization_id AND p.employee_id = emc.employee_id
   AND p.year_month = emc.year_month AND p.voided_at IS NULL
  WHERE emc.organization_id = ${orgId}
    AND emc.status IN ('draft','applied','closed')
    AND ABS(emc.known_amount::numeric - p.expected_amount::numeric) > 0.01
  ORDER BY emc.year_month DESC, e.name`;

report.sections.labor_runs_by_month = await sql`
  SELECT emc.year_month,
         SUM(lar.allocated_amount::numeric) allocated,
         SUM(lar.unallocated_amount::numeric) unallocated,
         SUM(lar.company_only_amount::numeric) company_only,
         SUM(larl.amount::numeric) line_sum_to_projects
  FROM employee_month_costs emc
  JOIN labor_allocation_runs lar ON lar.employee_month_cost_id = emc.id
    AND lar.organization_id = emc.organization_id AND lar.status = 'applied'
  LEFT JOIN labor_allocation_run_lines larl ON larl.labor_allocation_run_id = lar.id
    AND larl.organization_id = lar.organization_id
  WHERE emc.organization_id = ${orgId} AND emc.status IN ('applied','closed')
  GROUP BY emc.year_month ORDER BY emc.year_month`;

report.sections.pending_hours = await sql`
  SELECT approval_status, COUNT(*)::int n, SUM(hours::numeric) hours
  FROM time_entries
  WHERE organization_id = ${orgId} AND kind = 'project' AND status = 'recorded'
    AND archived_at IS NULL AND voided_at IS NULL
  GROUP BY approval_status`;

report.sections.expense_ap = await sql`
  SELECT
    (SELECT COUNT(*)::int FROM expenses WHERE organization_id = ${orgId}
      AND status = 'finalized' AND archived_at IS NULL) finalized_expenses,
    (SELECT COUNT(*)::int FROM ap_bills WHERE organization_id = ${orgId}
      AND status IN ('open','partially_matched','matched') AND archived_at IS NULL) ap_bills,
    (SELECT COUNT(*)::int FROM ap_po_matches WHERE organization_id = ${orgId} AND status = 'accepted') accepted_matches`;

report.sections.expense_double_a3 = await sql`
  WITH direct AS (
    SELECT e.id expense_id, e.project_id, e.net_amount::numeric amount
    FROM expenses e WHERE e.organization_id = ${orgId} AND e.status = 'finalized'
      AND e.archived_at IS NULL AND COALESCE(e.inventory_stock_purchase,false)=false AND e.project_id IS NOT NULL
  ), alloc AS (
    SELECT e.id expense_id, ea.project_id, ea.amount::numeric amount
    FROM expense_allocations ea JOIN expenses e ON e.id = ea.expense_id AND e.organization_id = ea.organization_id
    WHERE ea.organization_id = ${orgId} AND ea.target_type = 'project' AND e.status = 'finalized'
  ), combined AS (
    SELECT * FROM direct UNION ALL SELECT * FROM alloc
  )
  SELECT c.expense_id, c.project_id, SUM(c.amount) composed, MAX(e.net_amount::numeric) net_once,
         SUM(c.amount) - MAX(e.net_amount::numeric) excess
  FROM combined c JOIN expenses e ON e.id = c.expense_id
  GROUP BY c.expense_id, c.project_id
  HAVING COUNT(DISTINCT expense_id) >= 1 AND SUM(amount) > MAX(e.net_amount::numeric) + 0.01
  LIMIT 20`;

report.sections.internal_payroll_expenses = await sql`
  SELECT e.id, e.expense_date, e.net_amount, e.description, cc.key category_key
  FROM expenses e
  LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id
  WHERE e.organization_id = ${orgId} AND e.status = 'finalized' AND e.archived_at IS NULL
    AND cc.key = 'internal_employee_payroll'
  LIMIT 30`;

report.sections.margin_snapshots = await sql`
  SELECT year_month, COUNT(*)::int projects,
         SUM(actual_cost::numeric) sum_actual_cost,
         SUM(actual_margin::numeric) sum_margin,
         SUM(contract_value::numeric) sum_ccv
  FROM project_margin_snapshots
  WHERE organization_id = ${orgId}
  GROUP BY year_month ORDER BY year_month DESC LIMIT 15`;

report.sections.labor_lines_by_project = await sql`
  SELECT p.id project_id, p.name, SUM(larl.amount::numeric) labor_from_monthly_lines
  FROM labor_allocation_run_lines larl
  JOIN labor_allocation_runs lar ON lar.id = larl.labor_allocation_run_id
  JOIN employee_month_costs emc ON emc.id = lar.employee_month_cost_id
  JOIN projects p ON p.id = larl.project_id AND p.organization_id = larl.organization_id
  WHERE larl.organization_id = ${orgId} AND lar.status = 'applied'
    AND emc.status IN ('applied','closed')
  GROUP BY p.id, p.name
  HAVING SUM(larl.amount::numeric) > 0
  ORDER BY labor_from_monthly_lines DESC
  LIMIT 25`;

report.sections.approved_time_cost_by_project = await sql`
  SELECT p.id, p.name, COALESCE(SUM(te.cost_amount::numeric),0) time_labor_cost
  FROM projects p
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.organization_id = p.organization_id
    AND te.kind='project' AND te.status='recorded' AND te.approval_status='approved'
    AND te.archived_at IS NULL
  WHERE p.organization_id = ${orgId} AND p.archived_at IS NULL
  GROUP BY p.id, p.name
  HAVING COALESCE(SUM(te.cost_amount::numeric),0) > 0
  LIMIT 25`;

const outPath = resolve(process.cwd(), '.tools/owner-truth-8ef9.json');
writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Wrote', outPath);
await sql.end();
