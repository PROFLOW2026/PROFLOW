import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve(process.cwd());
const raw = readFileSync(resolve(root, '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const orgs = [
  { id: 'b1460c82-36cd-429a-b30d-ea5644d58fe3', label: 'proflow_main' },
  { id: '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec', label: 'eran_org' },
];

const out = {};
for (const { id, label } of orgs) {
  out[label] = {
    active_emc_by_month: await sql`
      SELECT year_month, known_quality, COUNT(*)::int AS n, SUM(known_amount::numeric) AS sum_known
      FROM employee_month_costs
      WHERE organization_id = ${id} AND status IN ('draft','applied','closed')
      GROUP BY year_month, known_quality
      ORDER BY year_month DESC`,
    payroll_vs_active_emc: await sql`
      SELECT e.name, emc.year_month,
             emc.known_amount::numeric AS emc_known, emc.known_quality,
             p.expected_amount::numeric AS pay_exp, p.paid_amount::numeric AS pay_paid, p.payment_status
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      LEFT JOIN employee_payroll_payments p
        ON p.organization_id = emc.organization_id AND p.employee_id = emc.employee_id
       AND p.year_month = emc.year_month AND p.voided_at IS NULL
      WHERE emc.organization_id = ${id}
        AND emc.status IN ('draft','applied','closed')
        AND p.id IS NOT NULL
        AND ABS(emc.known_amount::numeric - p.expected_amount::numeric) > 0.01
      ORDER BY emc.year_month DESC, e.name`,
    eran_or_manager: await sql`
      SELECT emc.year_month, e.name, emc.known_amount, emc.known_quality, emc.status,
             p.expected_amount, p.paid_amount, p.payment_status
      FROM employee_month_costs emc
      JOIN employees e ON e.id = emc.employee_id
      LEFT JOIN employee_payroll_payments p
        ON p.organization_id = emc.organization_id AND p.employee_id = emc.employee_id
       AND p.year_month = emc.year_month AND p.voided_at IS NULL
      WHERE emc.organization_id = ${id}
        AND emc.status IN ('draft','applied','closed')
        AND (e.compensation_class = 'owner_manager' OR e.name ILIKE '%ערן%' OR e.name ILIKE '%מנהל העסק%')
      ORDER BY e.name, emc.year_month DESC`,
  };
}

console.log(JSON.stringify(out, null, 2));
await sql.end();
