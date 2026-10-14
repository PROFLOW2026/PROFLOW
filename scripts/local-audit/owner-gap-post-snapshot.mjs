import postgres from 'postgres';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const CUTOFF = '2026-09-30T23:59:59.999Z';
const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
let url = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
const sql = postgres(url, { max: 1 });

const projects = [
  'f3f79519-fed6-4307-81ac-0a7bd11df986',
  '685e5343-606e-43fb-b5b2-d2b3bc2f9662',
  'ee7cb842-bbd1-4188-b95e-9f98446c92aa',
  '13e2886d-8fe3-47fd-be89-f9c66cbd4c71',
];

const out = { cutoff: CUTOFF, projects: {} };

for (const pid of projects) {
  out.projects[pid] = {
    expenses_after_snapshot: await sql`
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(net_amount::numeric),0) AS sum_net
      FROM expenses
      WHERE organization_id = ${ORG} AND project_id = ${pid}
        AND status = 'finalized' AND archived_at IS NULL
        AND updated_at > ${CUTOFF}::timestamptz`,
    expenses_oct_dates: await sql`
      SELECT COUNT(*)::int AS cnt, COALESCE(SUM(net_amount::numeric),0) AS sum_net
      FROM expenses
      WHERE organization_id = ${ORG} AND project_id = ${pid}
        AND status = 'finalized' AND archived_at IS NULL
        AND expense_date >= '2026-10-01'`,
    labor_lines_after_snapshot: await sql`
      SELECT COALESCE(SUM(larl.amount::numeric),0) AS sum_labor
      FROM labor_allocation_run_lines larl
      JOIN labor_allocation_runs lar ON lar.id = larl.labor_allocation_run_id
      WHERE larl.organization_id = ${ORG} AND larl.project_id = ${pid}
        AND lar.status = 'applied' AND lar.applied_at > ${CUTOFF}::timestamptz`,
    labor_oct_emc: await sql`
      SELECT COALESCE(SUM(larl.amount::numeric),0) AS sum_labor
      FROM labor_allocation_run_lines larl
      JOIN labor_allocation_runs lar ON lar.id = larl.labor_allocation_run_id
      JOIN employee_month_costs emc ON emc.id = lar.employee_month_cost_id
      WHERE larl.organization_id = ${ORG} AND larl.project_id = ${pid}
        AND emc.year_month = '2026-10' AND lar.status = 'applied'`,
  };
}

console.log(JSON.stringify(out, null, 2));
await sql.end();
