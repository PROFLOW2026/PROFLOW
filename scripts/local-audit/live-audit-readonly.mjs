/**
 * One-off READ-ONLY production audit runner (lead). SELECT only.
 * Usage: node .tools/live-audit-readonly.mjs
 */
import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const raw = readFileSync(resolve(root, '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (t.startsWith('DATABASE_URL=')) {
        let v = t.slice('DATABASE_URL='.length).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        return v;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

const DATABASE_URL = loadDatabaseUrl();
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1, idle_timeout: 5, connect_timeout: 30 });

const report = { sections: [] };

function section(title, rows) {
  report.sections.push({ title, rowCount: rows.length, sample: rows.slice(0, 80) });
}

try {
  const orgs = await sql`
    SELECT id, name, created_at::date AS created
    FROM organizations
    ORDER BY created_at DESC
    LIMIT 10`;
  section('organizations', orgs);

  let orgId = process.env.AUDIT_ORG_ID ?? null;
  if (!orgId && orgs.length === 1) orgId = orgs[0].id;

  if (!orgId) {
    const ranked = await sql`
      SELECT o.id, COUNT(emc.id)::int AS emc_rows, COUNT(DISTINCT e.id)::int AS employees
      FROM organizations o
      LEFT JOIN employees e ON e.organization_id = o.id AND e.archived_at IS NULL
      LEFT JOIN employee_month_costs emc ON emc.organization_id = o.id
      GROUP BY o.id
      ORDER BY emc_rows DESC, employees DESC
      LIMIT 5`;
    section('org_rank_by_emc', ranked);
    if (ranked[0]?.emc_rows > 0) orgId = ranked[0].id;
  }

  if (!orgId) {
    console.log(JSON.stringify({ error: 'Set AUDIT_ORG_ID', orgs }, null, 2));
    process.exit(2);
  }

  const eran = await sql`
    SELECT id, name, status, compensation_class, user_id IS NOT NULL AS linked_user
    FROM employees
    WHERE organization_id = ${orgId} AND archived_at IS NULL
      AND (
        (name ILIKE '%ערן%' AND name ILIKE '%יוסף%')
        OR name ILIKE '%Eran%Yosef%'
        OR name ILIKE '%Eran Yosef%'
      )
    LIMIT 5`;
  section('eran_yosef_employees', eran);

  section(
    'emc_year_range',
    await sql`
      SELECT MIN(year_month) AS min_ym, MAX(year_month) AS max_ym, COUNT(*) AS emc_rows
      FROM employee_month_costs
      WHERE organization_id = ${orgId}`,
  );

  section(
    'emc_by_month_quality',
    await sql`
      SELECT year_month, known_quality, COUNT(*)::int AS employees,
             SUM(estimated_amount::numeric) AS sum_est,
             SUM(COALESCE(actual_amount, 0)::numeric) AS sum_act,
             SUM(known_amount::numeric) AS sum_known
      FROM employee_month_costs
      WHERE organization_id = ${orgId}
      GROUP BY year_month, known_quality
      ORDER BY year_month DESC, known_quality
      LIMIT 120`,
  );

  section(
    'emc_actual_quality_rows',
    await sql`
      SELECT e.name, emc.year_month, emc.estimated_amount, emc.actual_amount, emc.known_amount,
             emc.known_quality, emc.status, emc.recognition_source
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      WHERE emc.organization_id = ${orgId}
        AND emc.known_quality = 'actual'
      ORDER BY emc.year_month DESC, e.name
      LIMIT 100`,
  );

  section(
    'emc_actual_less_than_estimated',
    await sql`
      SELECT e.name, emc.year_month, emc.estimated_amount, emc.actual_amount, emc.known_amount, emc.known_quality
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      WHERE emc.organization_id = ${orgId}
        AND emc.known_quality = 'actual'
        AND emc.estimated_amount IS NOT NULL
        AND emc.known_amount::numeric < emc.estimated_amount::numeric
      ORDER BY emc.year_month DESC`,
  );

  if (eran.length >= 1) {
    const eid = eran[0].id;
    section(
      'eran_rate_versions',
      await sql`
        SELECT valid_from, valid_to, rate_unit, base_rate, burden_percent, estimated_employer_cost, currency
        FROM rate_versions
        WHERE organization_id = ${orgId} AND employee_id = ${eid}
        ORDER BY valid_from DESC
        LIMIT 10`,
    );
    section(
      'eran_emc',
      await sql`
        SELECT year_month, status, estimated_amount, actual_amount, known_amount, known_quality, recognition_source
        FROM employee_month_costs
        WHERE organization_id = ${orgId} AND employee_id = ${eid}
        ORDER BY year_month DESC
        LIMIT 36`,
    );
    section(
      'eran_payroll_payments',
      await sql`
        SELECT year_month, expected_amount, paid_amount, payment_status, due_date, paid_at, obligation_source
        FROM employee_payroll_payments
        WHERE organization_id = ${orgId} AND employee_id = ${eid} AND voided_at IS NULL
        ORDER BY year_month DESC
        LIMIT 36`,
    );
  }

  section(
    'payroll_paid_vs_emc_known',
    await sql`
      SELECT emc.year_month, e.name,
             emc.known_amount::numeric AS emc_known,
             emc.known_quality,
             p.expected_amount::numeric AS payroll_expected,
             p.paid_amount::numeric AS payroll_paid,
             p.payment_status
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      LEFT JOIN employee_payroll_payments p
        ON p.organization_id = emc.organization_id
       AND p.employee_id = emc.employee_id
       AND p.year_month = emc.year_month
       AND p.voided_at IS NULL
      WHERE emc.organization_id = ${orgId}
        AND p.paid_amount IS NOT NULL
        AND p.paid_amount::numeric > 0
      ORDER BY emc.year_month DESC
      LIMIT 80`,
  );

  section(
    'monthly_allocated_with_time_snapshot_same_month',
    await sql`
      SELECT emc.year_month, e.name, emc.known_amount, emc.recognition_source, emc.status,
             COALESCE(te.approved_hours, 0) AS approved_project_hours
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      LEFT JOIN LATERAL (
        SELECT SUM(hours::numeric) AS approved_hours
        FROM time_entries te
        WHERE te.organization_id = emc.organization_id
          AND te.employee_id = emc.employee_id
          AND te.status = 'recorded'
          AND te.approval_status = 'approved'
          AND te.kind = 'project'
          AND to_char(te.work_date, 'YYYY-MM') = emc.year_month
      ) te ON true
      WHERE emc.organization_id = ${orgId}
        AND emc.recognition_source = 'monthly_allocated'
        AND emc.status IN ('applied', 'closed')
      ORDER BY emc.year_month DESC
      LIMIT 60`,
  );

  section(
    'pending_project_hours_by_project',
    await sql`
      SELECT te.project_id, COUNT(*)::int AS pending_rows, SUM(te.hours::numeric) AS pending_hours
      FROM time_entries te
      WHERE te.organization_id = ${orgId}
        AND te.status = 'recorded'
        AND te.approval_status IN ('draft', 'submitted')
        AND te.kind = 'project'
        AND te.voided_at IS NULL
      GROUP BY te.project_id
      ORDER BY pending_hours DESC NULLS LAST
      LIMIT 20`,
  );

  section(
    'expense_header_plus_allocations',
    await sql`
      SELECT e.id AS expense_id, e.project_id AS header_project,
             COUNT(DISTINCT al.project_id)::int AS alloc_projects,
             e.net_amount::numeric AS net
      FROM expenses e
      JOIN expense_allocations al ON al.expense_id = e.id AND al.organization_id = e.organization_id
      WHERE e.organization_id = ${orgId}
        AND e.status = 'finalized'
        AND e.archived_at IS NULL
        AND e.project_id IS NOT NULL
      GROUP BY e.id, e.project_id, e.net_amount
      LIMIT 50`,
  );

  section(
    'accepted_ap_expense_partial_matches',
    await sql`
      SELECT m.ap_bill_id, m.expense_id, m.matched_amount::numeric AS matched,
             b.net_amount::numeric AS bill_net, e.net_amount::numeric AS expense_net
      FROM ap_po_matches m
      JOIN ap_bills b ON b.id = m.ap_bill_id AND b.organization_id = m.organization_id
      JOIN expenses e ON e.id = m.expense_id AND e.organization_id = m.organization_id
      WHERE m.organization_id = ${orgId} AND m.status = 'accepted'
        AND m.expense_id IS NOT NULL
        AND m.matched_amount::numeric < LEAST(b.net_amount::numeric, e.net_amount::numeric)
      ORDER BY m.created_at DESC
      LIMIT 30`,
  );

  section(
    'ap_payments_count',
    await sql`
      SELECT COUNT(*)::int AS payment_rows, SUM(amount::numeric) AS sum_amount
      FROM ap_payments
      WHERE organization_id = ${orgId} AND voided_at IS NULL`,
  );

  section(
    'expenses_paid_vs_open',
    await sql`
      SELECT payment_status, COUNT(*)::int AS cnt, SUM(net_amount::numeric) AS sum_net
      FROM expenses
      WHERE organization_id = ${orgId}
        AND status = 'finalized'
        AND archived_at IS NULL
        AND voids_expense_id IS NULL
      GROUP BY payment_status
      ORDER BY cnt DESC`,
  );

  section(
    'projects_with_cost_signals',
    await sql`
      SELECT p.id, p.name, p.status,
             COALESCE(l.labor_net, 0) AS labor_from_time,
             COALESCE(x.expense_net, 0) AS expense_net_on_project
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT SUM(te.cost_amount::numeric) AS labor_net
        FROM time_entries te
        WHERE te.organization_id = p.organization_id
          AND te.project_id = p.id
          AND te.status = 'recorded'
          AND te.approval_status = 'approved'
          AND te.cost_amount IS NOT NULL
      ) l ON true
      LEFT JOIN LATERAL (
        SELECT SUM(e.net_amount::numeric) AS expense_net
        FROM expenses e
        WHERE e.organization_id = p.organization_id
          AND e.project_id = p.id
          AND e.status = 'finalized'
          AND e.archived_at IS NULL
          AND e.voids_expense_id IS NULL
      ) x ON true
      WHERE p.organization_id = ${orgId}
        AND p.archived_at IS NULL
      ORDER BY (COALESCE(l.labor_net, 0) + COALESCE(x.expense_net, 0)) DESC NULLS LAST
      LIMIT 25`,
  );

  console.log(JSON.stringify({ orgId, report }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
