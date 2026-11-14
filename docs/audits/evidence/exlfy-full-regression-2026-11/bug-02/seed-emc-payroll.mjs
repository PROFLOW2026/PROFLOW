/**
 * AUDIT-ONLY seed for BUG-02 (projectflow_e2e disposable DB).
 *
 * Creates:
 * - dedicated employee in the primary E2E org
 * - ≥1 employee_month_costs rows (history + target month) with Date-like timestamps
 * - unpaid employee_payroll_payments for the target yearMonth
 *
 * Refuses any DATABASE_URL that is not clearly projectflow_e2e.
 *
 * Usage (after harness world seed):
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e'
 *   node docs/audits/evidence/exlfy-full-regression-2026-11/bug-02/seed-emc-payroll.mjs
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const logDir = path.join(evidenceDir, 'logs');
const fixturePath = path.join(evidenceDir, 'bug-02-emc-seed.json');
const worldPath = path.resolve(evidenceDir, '../../../../../tests/e2e/.world.json');

const YEAR_MONTH = process.env.BUG02_YEAR_MONTH?.trim() || '2026-10';
const HISTORY_MONTH = process.env.BUG02_HISTORY_MONTH?.trim() || '2026-09';
const AMOUNT = '8250.000000';
const EMPLOYEE_NAME = 'BUG02 EMC Payroll Employee';

function assertDisposableE2eUrl(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('DATABASE_URL required');
  }
  const lower = url.toLowerCase();
  if (!lower.includes('projectflow_e2e')) {
    throw new Error(
      `Refusing seed: DATABASE_URL must target disposable projectflow_e2e (got host/db without that name)`,
    );
  }
  if (lower.includes('supabase.co') || lower.includes('pooler.supabase')) {
    throw new Error('Refusing seed: looks like Supabase/cloud — not allowed');
  }
}

function readWorldOrgId() {
  if (!existsSync(worldPath)) {
    throw new Error(`Missing E2E world file at ${worldPath} — start harness first`);
  }
  const world = JSON.parse(readFileSync(worldPath, 'utf8'));
  if (!world.organizationId) {
    throw new Error('world.json missing organizationId');
  }
  return world.organizationId;
}

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL?.trim() ||
    'postgres://postgres:postgres@127.0.0.1:5432/projectflow_e2e';
  assertDisposableE2eUrl(databaseUrl);

  const organizationId = readWorldOrgId();
  const employeeId = randomUUID();
  const emcHistoryId = randomUUID();
  const emcTargetId = randomUUID();
  const paymentId = randomUUID();
  const nowIso = new Date().toISOString();

  const sql = postgres(databaseUrl, { max: 1, prepare: false, onnotice: () => {} });

  try {
    const orgRows = await sql`
      SELECT id FROM organizations WHERE id = ${organizationId} LIMIT 1
    `;
    if (orgRows.length === 0) {
      throw new Error(`Organization ${organizationId} not found — harness seed incomplete`);
    }

    // Idempotent: remove prior BUG02 employee by name in this org (cascade cleans EMC/payroll).
    await sql`
      DELETE FROM employees
      WHERE organization_id = ${organizationId}
        AND name = ${EMPLOYEE_NAME}
    `;

    await sql`
      INSERT INTO employees (
        id, organization_id, name, status, compensation_class, default_labor_allocation_intent
      ) VALUES (
        ${employeeId},
        ${organizationId},
        ${EMPLOYEE_NAME},
        'active',
        'standard',
        'auto_pool'
      )
    `;

    // History month (any prior EMC row → showMonthReview true via months[]).
    await sql`
      INSERT INTO employee_month_costs (
        id, organization_id, employee_id, year_month, currency,
        estimated_amount, actual_amount, known_amount, known_quality,
        source, recognition_source, status, notes,
        locked_at, created_at, updated_at
      ) VALUES (
        ${emcHistoryId},
        ${organizationId},
        ${employeeId},
        ${HISTORY_MONTH},
        'ILS',
        ${AMOUNT},
        NULL,
        ${AMOUNT},
        'estimated',
        'manual',
        'time_snapshot',
        'draft',
        'BUG02 audit history EMC',
        NULL,
        ${nowIso}::timestamptz,
        ${nowIso}::timestamptz
      )
    `;

    // Target month matching unpaid payroll payment.
    await sql`
      INSERT INTO employee_month_costs (
        id, organization_id, employee_id, year_month, currency,
        estimated_amount, actual_amount, known_amount, known_quality,
        source, recognition_source, status, notes,
        locked_at, created_at, updated_at
      ) VALUES (
        ${emcTargetId},
        ${organizationId},
        ${employeeId},
        ${YEAR_MONTH},
        'ILS',
        ${AMOUNT},
        NULL,
        ${AMOUNT},
        'estimated',
        'manual',
        'time_snapshot',
        'draft',
        'BUG02 audit target EMC',
        NULL,
        ${nowIso}::timestamptz,
        ${nowIso}::timestamptz
      )
    `;

    await sql`
      INSERT INTO employee_payroll_payments (
        id, organization_id, employee_id, year_month, currency,
        expected_amount, paid_amount, payment_status, due_date,
        paid_at, payment_confirmation_source, obligation_source, notes,
        created_at, updated_at
      ) VALUES (
        ${paymentId},
        ${organizationId},
        ${employeeId},
        ${YEAR_MONTH},
        'ILS',
        ${AMOUNT},
        NULL,
        'due',
        ${`${YEAR_MONTH}-31`},
        NULL,
        NULL,
        'manual_correction',
        'BUG02 unpaid payroll for deep-link probe',
        ${nowIso}::timestamptz,
        ${nowIso}::timestamptz
      )
    `;

    const verify = await sql`
      SELECT
        (SELECT count(*)::int FROM employee_month_costs WHERE employee_id = ${employeeId}) AS emc_count,
        (SELECT payment_status FROM employee_payroll_payments WHERE id = ${paymentId}) AS payment_status,
        (SELECT pg_typeof(created_at)::text FROM employee_month_costs WHERE id = ${emcTargetId}) AS created_at_pg_type
    `;

    const fixture = {
      seededAt: nowIso,
      database: 'projectflow_e2e',
      organizationId,
      employeeId,
      employeeName: EMPLOYEE_NAME,
      yearMonth: YEAR_MONTH,
      historyMonth: HISTORY_MONTH,
      emcHistoryId,
      emcTargetId,
      paymentId,
      amount: AMOUNT,
      deepLinkWithPayment: `/he-IL/workforce/employees/${employeeId}?yearMonth=${YEAR_MONTH}&focus=payroll&paymentId=${paymentId}`,
      deepLinkWithoutPayment: `/he-IL/workforce/employees/${employeeId}?yearMonth=${YEAR_MONTH}&focus=payroll`,
      verify: verify[0],
    };

    mkdirSync(logDir, { recursive: true });
    writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    writeFileSync(path.join(logDir, 'emc-payroll-seed.json'), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ ok: true, fixturePath, ...fixture }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error('[bug02-seed]', err);
  process.exit(1);
});
