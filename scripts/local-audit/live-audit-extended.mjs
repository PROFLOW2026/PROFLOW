/**
 * Extended READ-ONLY audit queries — production.
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(process.cwd());
const raw = readFileSync(resolve(root, '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim();
if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
  url = url.slice(1, -1);
}

const orgId = process.env.AUDIT_ORG_ID ?? 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const sql = postgres(url, { max: 1 });

const out = {};

out.ownerManagers = await sql`
  SELECT id, name, compensation_class, default_labor_allocation_intent
  FROM employees
  WHERE organization_id = ${orgId} AND archived_at IS NULL
  ORDER BY name`;

out.rates_18k = await sql`
  SELECT e.name, rv.valid_from, rv.valid_to, rv.base_rate, rv.burden_percent, rv.rate_unit,
         rv.estimated_employer_cost
  FROM rate_versions rv
  JOIN employees e ON e.id = rv.employee_id
  WHERE rv.organization_id = ${orgId}
    AND rv.base_rate::numeric = 18000
  ORDER BY e.name, rv.valid_from DESC`;

out.emc_27k = await sql`
  SELECT e.name, emc.year_month, emc.known_amount, emc.known_quality, emc.estimated_amount, emc.actual_amount, emc.status
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  WHERE emc.organization_id = ${orgId}
    AND emc.known_amount::numeric = 27000
  ORDER BY emc.year_month DESC, e.name`;

out.manager_emc_all = await sql`
  SELECT emc.year_month, emc.known_amount, emc.known_quality, emc.estimated_amount, emc.actual_amount, emc.status, emc.recognition_source
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  WHERE emc.organization_id = ${orgId}
    AND e.compensation_class = 'owner_manager'
  ORDER BY emc.year_month DESC`;

out.eran_all_orgs = await sql`
  SELECT organization_id, id, name, compensation_class
  FROM employees
  WHERE archived_at IS NULL
    AND (
      name ILIKE '%Eran%' OR name ILIKE '%Yosef%' OR name ILIKE '%ערן%' OR name ILIKE '%יוסף%'
    )
  LIMIT 20`;

out.payroll_mismatch = await sql`
  SELECT e.name, emc.year_month,
         emc.known_amount::numeric AS emc_known,
         p.expected_amount::numeric AS pay_expected,
         ABS(emc.known_amount::numeric - p.expected_amount::numeric) AS delta
  FROM employee_month_costs emc
  JOIN employees e ON e.id = emc.employee_id
  JOIN employee_payroll_payments p
    ON p.organization_id = emc.organization_id
   AND p.employee_id = emc.employee_id
   AND p.year_month = emc.year_month
   AND p.voided_at IS NULL
  WHERE emc.organization_id = ${orgId}
    AND ABS(emc.known_amount::numeric - p.expected_amount::numeric) > 0.01
  ORDER BY emc.year_month DESC`;

out.expense_ap_dup_candidates = await sql`
  SELECT e.id AS expense_id, e.expense_date, e.net_amount, e.description,
         m.matched_amount, b.id AS bill_id, b.net_amount AS bill_net
  FROM expenses e
  JOIN ap_po_matches m ON m.expense_id = e.id AND m.organization_id = e.organization_id AND m.status = 'accepted'
  JOIN ap_bills b ON b.id = m.ap_bill_id
  WHERE e.organization_id = ${orgId}
    AND e.status = 'finalized'
    AND e.archived_at IS NULL
  ORDER BY e.expense_date DESC
  LIMIT 40`;

out.labor_runs_summary = await sql`
  SELECT emc.year_month, COUNT(lar.id)::int AS runs,
         SUM(lar.allocated_amount::numeric) AS allocated,
         SUM(lar.unallocated_amount::numeric) AS unallocated,
         SUM(lar.company_only_amount::numeric) AS company_only
  FROM employee_month_costs emc
  JOIN labor_allocation_runs lar ON lar.employee_month_cost_id = emc.id AND lar.organization_id = emc.organization_id
  WHERE emc.organization_id = ${orgId} AND lar.status = 'applied'
  GROUP BY emc.year_month
  ORDER BY emc.year_month DESC
  LIMIT 12`;

console.log(JSON.stringify({ orgId, ...out }, null, 2));
await sql.end({ timeout: 5 });
