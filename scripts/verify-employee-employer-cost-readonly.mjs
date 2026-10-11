/**
 * Read-only employer-cost reconciliation for one employee (Owner runs locally).
 *
 * Compares: rate_versions pool math, employee_month_costs (EMC), labor runs,
 * and payroll payment rows. Does NOT INSERT/UPDATE/DELETE.
 *
 * Usage:
 *   set DATABASE_URL=... (production only with Owner approval)
 *   node scripts/verify-employee-employer-cost-readonly.mjs --org <uuid> --employee <uuid>
 *   node scripts/verify-employee-employer-cost-readonly.mjs --org <uuid> --name "Eran Yosef"
 *
 * Optional: --year-month 2026-01
 */
import pg from 'pg';

function parseArgs(argv) {
  const out = { orgId: null, employeeId: null, name: null, yearMonth: null };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--org' && value) {
      out.orgId = value;
      i++;
    } else if (flag === '--employee' && value) {
      out.employeeId = value;
      i++;
    } else if (flag === '--name' && value) {
      out.name = value;
      i++;
    } else if (flag === '--year-month' && value) {
      out.yearMonth = value;
      i++;
    }
  }
  return out;
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const args = parseArgs(process.argv);
if (!args.orgId) {
  console.error('--org <organization_id> is required');
  process.exit(1);
}
if (!args.employeeId && !args.name) {
  console.error('Provide --employee <uuid> or --name "Display Name"');
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL, statement_timeout: 120_000 });
await client.connect();

try {
  let employeeId = args.employeeId;
  if (!employeeId) {
    const { rows } = await client.query(
      `SELECT id, display_name, status
       FROM employees
       WHERE organization_id = $1
         AND archived_at IS NULL
         AND display_name ILIKE $2
       ORDER BY display_name
       LIMIT 5`,
      [args.orgId, `%${args.name.trim()}%`],
    );
    if (rows.length === 0) {
      console.error('No employee matched name');
      process.exit(2);
    }
    if (rows.length > 1) {
      console.log('Multiple matches — pick --employee:');
      for (const row of rows) console.log(`  ${row.id}  ${row.display_name} (${row.status})`);
      process.exit(2);
    }
    employeeId = rows[0].id;
    console.log(`Employee: ${rows[0].display_name} (${employeeId})\n`);
  }

  const { rows: rates } = await client.query(
    `SELECT valid_from, valid_to, rate_unit, base_rate, burden_percent, currency
     FROM rate_versions
     WHERE organization_id = $1 AND employee_id = $2
     ORDER BY valid_from DESC
     LIMIT 8`,
    [args.orgId, employeeId],
  );

  console.log('=== rate_versions (newest first) ===');
  for (const r of rates) {
    console.log(
      `${r.valid_from} → ${r.valid_to ?? 'open'} | ${r.rate_unit} base=${r.base_rate} burden=${r.burden_percent}% ${r.currency}`,
    );
  }

  const ymFilter = args.yearMonth ? 'AND emc.year_month = $3' : '';
  const emcParams = args.yearMonth ? [args.orgId, employeeId, args.yearMonth] : [args.orgId, employeeId];
  const { rows: emcRows } = await client.query(
    `SELECT year_month, status, estimated_amount, actual_amount, known_amount, known_quality
     FROM employee_month_costs emc
     WHERE organization_id = $1 AND employee_id = $2 ${ymFilter}
     ORDER BY year_month DESC
     LIMIT 12`,
    emcParams,
  );

  console.log('\n=== employee_month_costs ===');
  if (emcRows.length === 0) console.log('(none)');
  for (const row of emcRows) {
    console.log(
      `${row.year_month} | ${row.status} | est=${row.estimated_amount} act=${row.actual_amount ?? '—'} known=${row.known_amount} (${row.known_quality})`,
    );
  }

  const { rows: runs } = await client.query(
    `SELECT lar.year_month, lar.status, lar.method, lar.allocated_amount, lar.unallocated_amount, lar.remainder_allocation_intent
     FROM labor_allocation_runs lar
     JOIN employee_month_costs emc ON emc.id = lar.employee_month_cost_id
     WHERE emc.organization_id = $1 AND emc.employee_id = $2
     ORDER BY lar.year_month DESC
     LIMIT 8`,
    [args.orgId, employeeId],
  );

  console.log('\n=== labor_allocation_runs (via EMC) ===');
  if (runs.length === 0) console.log('(none)');
  for (const row of runs) {
    console.log(
      `${row.year_month} | ${row.status} | ${row.method} alloc=${row.allocated_amount} unalloc=${row.unallocated_amount} intent=${row.remainder_allocation_intent ?? '—'}`,
    );
  }

  const { rows: payments } = await client.query(
    `SELECT year_month, status, expected_amount, paid_amount, paid_at
     FROM employee_payroll_payments
     WHERE organization_id = $1 AND employee_id = $2
     ORDER BY year_month DESC
     LIMIT 8`,
    [args.orgId, employeeId],
  );

  console.log('\n=== employee_payroll_payments (cash layer) ===');
  if (payments.length === 0) console.log('(none)');
  for (const row of payments) {
    console.log(
      `${row.year_month} | ${row.status} | expected=${row.expected_amount} paid=${row.paid_amount ?? '—'} at=${row.paid_at ?? '—'}`,
    );
  }

  console.log('\n(Read-only complete — no data was modified.)');
} finally {
  await client.end();
}
