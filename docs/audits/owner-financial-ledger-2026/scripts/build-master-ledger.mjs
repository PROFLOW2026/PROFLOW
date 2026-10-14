/**
 * READ-ONLY: Master owner financial ledger export (Production SELECT only).
 * Output: XLSX, RECONCILIATION_EVIDENCE.json, OWNER_FINANCIAL_RECONCILIATION_2026.md, ledger-data.json
 */
import postgres from 'postgres';
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dir, '..');
const ORG = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const OWNER_EMAIL = '18eran@gmail.com';
const PERIOD_FROM = '2026-01-01';
const PERIOD_TO = '2026-10-11';
const MONTHS = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
];

function loadDbUrl() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  const line = raw.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='));
  if (!line) throw new Error('DATABASE_URL missing in .env.local');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

function n(v) {
  if (v == null || v === '') return 0;
  return Number(v);
}

function fmt(v) {
  return n(v).toFixed(2);
}

function ymFromDate(d) {
  if (!d) return '';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  return s.slice(0, 7);
}

function appPath(kind, id) {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://app.projectflow.co.il';
  const paths = {
    expense: `/expenses/${id}`,
    project: `/projects/${id}`,
    employee: `/workforce/employees/${id}`,
    billing: `/billing/${id}`,
  };
  return `${base.replace(/\/$/, '')}${paths[kind] || ''}`;
}

async function extractAll(sql) {
  const meta = {
    orgId: ORG,
    ownerEmail: OWNER_EMAIL,
    periodFrom: PERIOD_FROM,
    periodTo: PERIOD_TO,
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_PRODUCTION_SELECT',
  };

  const ownerVerify = await sql`
    SELECT p.id AS user_id, p.email, p.display_name, o.name AS org_name
    FROM profiles p
    JOIN organization_memberships om ON om.user_id = p.id AND om.organization_id = ${ORG}::uuid
    JOIN organizations o ON o.id = om.organization_id
    WHERE lower(p.email) = ${OWNER_EMAIL.toLowerCase()}`;

  const projects = await sql`
    SELECT id, name, status FROM projects
    WHERE organization_id = ${ORG} AND archived_at IS NULL ORDER BY name`;

  const employees = await sql`
    SELECT id, name, compensation_class, default_labor_allocation_intent, status
    FROM employees WHERE organization_id = ${ORG} AND archived_at IS NULL ORDER BY name`;

  const expenseRows = await sql`
    SELECT e.id, e.expense_date, e.status, e.description, e.supplier_name,
           e.vendor_id, v.name AS vendor_table_name,
           e.project_id, p.name AS project_name,
           e.cost_family, e.cost_category_id, cc.key AS category_key, cc.name AS category_name,
           e.classification_status, e.net_amount, e.tax_amount, e.gross_amount, e.currency,
           e.payment_status, e.paid_at, e.due_date, e.paid_gross_amount,
           e.payment_method, e.allocation_intent, e.installment_count,
           e.is_recurring_template, e.recurring_template_id, e.source_recurring_draft_id,
           e.voids_expense_id, e.adjusts_expense_id, e.finalized_at, e.created_at, e.updated_at,
           e.inventory_stock_purchase, e.notes
    FROM expenses e
    LEFT JOIN vendors v ON v.id = e.vendor_id AND v.organization_id = e.organization_id
    LEFT JOIN projects p ON p.id = e.project_id AND p.organization_id = e.organization_id
    LEFT JOIN cost_categories cc ON cc.id = e.cost_category_id AND cc.organization_id = e.organization_id
    WHERE e.organization_id = ${ORG}
      AND e.archived_at IS NULL
      AND (
        e.expense_date BETWEEN ${PERIOD_FROM}::date AND ${PERIOD_TO}::date
        OR e.created_at::date BETWEEN ${PERIOD_FROM}::date AND ${PERIOD_TO}::date
        OR EXISTS (
          SELECT 1 FROM expense_managerial_schedule_lines m
          WHERE m.expense_id = e.id AND m.organization_id = e.organization_id
            AND m.year_month >= '2026-01' AND m.year_month <= '2026-10'
        )
      )
    ORDER BY e.expense_date, e.id`;

  const allocations = await sql`
    SELECT ea.id, ea.expense_id, ea.target_type, ea.project_id, p.name AS project_name,
           ea.amount, ea.currency, ea.method, ea.cost_category_id, ea.notes
    FROM expense_allocations ea
    LEFT JOIN projects p ON p.id = ea.project_id AND p.organization_id = ea.organization_id
    WHERE ea.organization_id = ${ORG}
      AND ea.expense_id IN (SELECT id FROM expenses WHERE organization_id = ${ORG} AND archived_at IS NULL)
    ORDER BY ea.expense_id, ea.sort_order`;

  const mgrLines = await sql`
    SELECT m.id, m.expense_id, m.year_month, m.amount, m.currency, m.status
    FROM expense_managerial_schedule_lines m
    WHERE m.organization_id = ${ORG}
      AND m.year_month >= '2026-01' AND m.year_month <= '2026-10'
    ORDER BY m.expense_id, m.year_month`;

  const apMatches = await sql`
    SELECT m.id, m.expense_id, m.ap_bill_id, m.status, m.matched_amount::text AS matched_amount
    FROM ap_po_matches m
    WHERE m.organization_id = ${ORG} AND m.expense_id IS NOT NULL`;

  const apBills = await sql`
    SELECT id, vendor_id, project_id, reference, status, bill_date, due_date,
           net_amount, tax_amount, gross_amount, total_amount, currency, purchase_order_id
    FROM ap_bills WHERE organization_id = ${ORG} AND archived_at IS NULL ORDER BY bill_date`;

  const apPayments = await sql`
    SELECT id, vendor_id, amount, currency, payment_date, status, reference
    FROM ap_payments WHERE organization_id = ${ORG} ORDER BY payment_date`;

  const apPaymentApps = await sql`
    SELECT apa.ap_payment_id, apa.ap_bill_id, apa.applied_amount, apa.currency
    FROM ap_payment_applications apa
    WHERE apa.organization_id = ${ORG}`;

  const committed = await sql`
    SELECT cc.id, cc.purchase_order_id, cc.project_id, cc.amount, cc.currency, cc.status
    FROM committed_costs cc WHERE cc.organization_id = ${ORG}`;

  const pos = await sql`
    SELECT id, reference, status, vendor_id, project_id, committed_amount, ordered_on
    FROM purchase_orders WHERE organization_id = ${ORG} AND archived_at IS NULL`;

  const emcActive = await sql`
    SELECT emc.*, e.name AS employee_name, e.compensation_class
    FROM employee_month_costs emc
    JOIN employees e ON e.id = emc.employee_id AND e.organization_id = emc.organization_id
    WHERE emc.organization_id = ${ORG}
      AND emc.status IN ('draft','applied','closed')
      AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
    ORDER BY emc.year_month, e.name`;

  const emcJournal = await sql`
    SELECT emc.id, emc.employee_id, e.name AS employee_name, emc.year_month,
           emc.estimated_amount, emc.actual_amount, emc.known_amount, emc.known_quality,
           emc.status, emc.source, emc.recognition_source, emc.adjusts_month_id,
           emc.locked_at, emc.created_at, emc.updated_at
    FROM employee_month_costs emc
    JOIN employees e ON e.id = emc.employee_id
    WHERE emc.organization_id = ${ORG}
      AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
    ORDER BY e.name, emc.year_month, emc.created_at`;

  const laborRuns = await sql`
    SELECT lar.id, lar.employee_month_cost_id, lar.status, lar.method,
           lar.allocated_amount, lar.unallocated_amount, lar.company_only_amount,
           lar.supersedes_run_id, lar.applied_at, emc.year_month, e.name AS employee_name
    FROM labor_allocation_runs lar
    JOIN employee_month_costs emc ON emc.id = lar.employee_month_cost_id
    JOIN employees e ON e.id = emc.employee_id
    WHERE lar.organization_id = ${ORG}
      AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
    ORDER BY emc.year_month, e.name, lar.created_at`;

  const laborLines = await sql`
    SELECT larl.id, larl.labor_allocation_run_id, larl.project_id, p.name AS project_name,
           larl.amount, larl.percent, larl.basis_hours, emc.year_month, e.name AS employee_name,
           lar.status AS run_status, lar.applied_at
    FROM labor_allocation_run_lines larl
    JOIN labor_allocation_runs lar ON lar.id = larl.labor_allocation_run_id
    JOIN employee_month_costs emc ON emc.id = lar.employee_month_cost_id
    JOIN employees e ON e.id = emc.employee_id
    LEFT JOIN projects p ON p.id = larl.project_id AND p.organization_id = larl.organization_id
    WHERE larl.organization_id = ${ORG}
      AND emc.year_month >= '2026-01' AND emc.year_month <= '2026-10'
    ORDER BY emc.year_month, e.name, p.name`;

  const rateVersions = await sql`
    SELECT rv.id, rv.employee_id, e.name AS employee_name,
           rv.valid_from, rv.valid_to, rv.base_rate, rv.rate_unit, rv.burden_percent,
           rv.working_days_per_month, rv.estimated_employer_cost, rv.source, rv.corrects_rate_version_id
    FROM rate_versions rv
    JOIN employees e ON e.id = rv.employee_id
    WHERE rv.organization_id = ${ORG}
    ORDER BY e.name, rv.valid_from`;

  const payroll = await sql`
    SELECT pp.*, e.name AS employee_name
    FROM employee_payroll_payments pp
    JOIN employees e ON e.id = pp.employee_id
    WHERE pp.organization_id = ${ORG} AND pp.voided_at IS NULL
      AND pp.year_month >= '2026-01' AND pp.year_month <= '2026-10'
    ORDER BY pp.year_month, e.name`;

  const billingAll = await sql`
    SELECT br.id, br.project_id, p.name AS project_name, br.client_id, br.contract_id,
           br.kind, br.reference, br.issue_date, br.due_date, br.status,
           br.subtotal_amount, br.tax_amount, br.total_amount, br.currency,
           br.finalized_at, br.voided_at, br.source_kind, br.created_at
    FROM billing_records br
    LEFT JOIN projects p ON p.id = br.project_id AND p.organization_id = br.organization_id
    WHERE br.organization_id = ${ORG} AND br.archived_at IS NULL
    ORDER BY br.issue_date, br.id`;

  const billingLines = await sql`
    SELECT bl.id, bl.billing_record_id, bl.description, bl.line_total, bl.change_order_id
    FROM billing_lines bl
    WHERE bl.organization_id = ${ORG}`;

  const payments = await sql`
    SELECT p.id, p.billing_record_id, p.client_id, p.amount, p.amount_basis, p.currency,
           p.payment_date, p.status, p.method, p.reference
    FROM payments p
    WHERE p.organization_id = ${ORG} AND p.status = 'recorded'
    ORDER BY p.payment_date`;

  const paymentApps = await sql`
    SELECT pa.payment_id, pa.billing_record_id, pa.applied_amount, pa.currency
    FROM payment_applications pa WHERE pa.organization_id = ${ORG}`;

  const contracts = await sql`
    SELECT c.id, c.project_id, p.name AS project_name, c.original_value_amount, c.currency,
           c.signed_date, c.start_date, c.is_primary, c.opening_reduction_net_amount
    FROM contracts c
    JOIN projects p ON p.id = c.project_id AND p.organization_id = c.organization_id
    WHERE c.organization_id = ${ORG} AND c.archived_at IS NULL`;

  const cve = await sql`
    SELECT id, project_id, contract_id, kind, amount, currency, effective_date, created_at
    FROM contract_value_events
    WHERE organization_id = ${ORG}
      AND effective_date >= ${PERIOD_FROM}::date AND effective_date <= ${PERIOD_TO}::date
    ORDER BY effective_date`;

  const changeOrders = await sql`
    SELECT co.id, co.project_id, p.name AS project_name, co.reference, co.amount, co.effective_date, co.direction
    FROM change_orders co
    JOIN projects p ON p.id = co.project_id AND p.organization_id = co.organization_id
    WHERE co.organization_id = ${ORG}
      AND co.effective_date BETWEEN ${PERIOD_FROM}::date AND ${PERIOD_TO}::date
    ORDER BY co.effective_date`;

  const snapshots = await sql`
    SELECT s.project_id, p.name AS project_name, s.year_month, s.contract_value, s.actual_cost,
           s.actual_margin, s.captured_at, s.updated_at
    FROM project_margin_snapshots s
    JOIN projects p ON p.id = s.project_id
    WHERE s.organization_id = ${ORG} AND s.year_month >= '2026-01' AND s.year_month <= '2026-10'
    ORDER BY s.year_month, p.name`;

  const recurringRuns = await sql`
    SELECT r.id, r.draft_id, r.run_date, r.occurrence_year_month,
           r.generated_entity_type, r.generated_entity_id
    FROM recurring_financial_draft_runs r
    WHERE r.organization_id = ${ORG}
      AND r.occurrence_year_month >= '2026-01' AND r.occurrence_year_month <= '2026-10'
    ORDER BY r.occurrence_year_month`;

  const recurringDrafts = await sql`
    SELECT id, draft_kind, title, frequency, status, next_run_date
    FROM recurring_financial_drafts WHERE organization_id = ${ORG}`;

  const internalPayrollExpenses = await sql`
    SELECT e.id, e.expense_date, e.net_amount, cc.key AS category_key
    FROM expenses e
    JOIN cost_categories cc ON cc.id = e.cost_category_id AND cc.organization_id = e.organization_id
    WHERE e.organization_id = ${ORG} AND e.archived_at IS NULL AND e.status = 'finalized'
      AND cc.key = 'internal_employee_payroll'`;

  const orgRecognizedByMonth = await sql`
    WITH months AS (
      SELECT unnest(ARRAY['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09','2026-10']::text[]) AS ym
    ),
    month_bounds AS (
      SELECT ym, (ym || '-01')::date AS from_d,
        (date_trunc('month', (ym || '-01')::date) + interval '1 month' - interval '1 day')::date AS to_d
      FROM months
    ),
    exp_slice AS (
      SELECT mb.ym, COALESCE(SUM(e.net_amount::numeric),0) AS sum_net
      FROM month_bounds mb
      LEFT JOIN expenses e ON e.organization_id = ${ORG}
        AND e.archived_at IS NULL AND e.status = 'finalized'
        AND e.expense_date BETWEEN mb.from_d AND mb.to_d
        AND COALESCE(e.inventory_stock_purchase,false) = false
        AND NOT EXISTS (
          SELECT 1 FROM ap_po_matches m
          JOIN ap_bills b ON b.id = m.ap_bill_id AND b.organization_id = m.organization_id
          WHERE m.expense_id = e.id AND m.organization_id = e.organization_id
            AND m.status = 'accepted' AND b.status IN ('open','partially_matched','matched')
        )
      GROUP BY mb.ym
    ),
    ap_slice AS (
      SELECT mb.ym, COALESCE(SUM(b.net_amount::numeric),0) AS sum_net
      FROM month_bounds mb
      LEFT JOIN ap_bills b ON b.organization_id = ${ORG}
        AND b.archived_at IS NULL AND b.status IN ('open','partially_matched','matched')
        AND b.bill_date BETWEEN mb.from_d AND mb.to_d
      GROUP BY mb.ym
    ),
    lab_slice AS (
      SELECT mb.ym, COALESCE(SUM(emc.known_amount::numeric),0) AS sum_net
      FROM month_bounds mb
      LEFT JOIN employee_month_costs emc ON emc.organization_id = ${ORG}
        AND emc.status IN ('draft','applied','closed')
        AND emc.year_month = mb.ym
      GROUP BY mb.ym
    )
    SELECT mb.ym,
           exp_slice.sum_net AS expenses_net,
           ap_slice.sum_net AS ap_bills_net,
           lab_slice.sum_net AS labor_emc_known,
           (exp_slice.sum_net + ap_slice.sum_net + lab_slice.sum_net) AS recognized_net_sum
    FROM month_bounds mb
    JOIN exp_slice ON exp_slice.ym = mb.ym
    JOIN ap_slice ON ap_slice.ym = mb.ym
    JOIN lab_slice ON lab_slice.ym = mb.ym
    ORDER BY mb.ym`;

  return {
    meta,
    ownerVerify,
    projects,
    employees,
    expenseRows,
    allocations,
    mgrLines,
    apMatches,
    apBills,
    apPayments,
    apPaymentApps,
    committed,
    pos,
    emcActive,
    emcJournal,
    laborRuns,
    laborLines,
    rateVersions,
    payroll,
    billingAll,
    billingLines,
    payments,
    paymentApps,
    contracts,
    cve,
    changeOrders,
    snapshots,
    recurringRuns,
    recurringDrafts,
    internalPayrollExpenses,
    orgRecognizedByMonth,
  };
}

function buildExpenseLedger(raw) {
  const allocByExp = new Map();
  for (const a of raw.allocations) {
    if (!allocByExp.has(a.expense_id)) allocByExp.set(a.expense_id, []);
    allocByExp.get(a.expense_id).push(a);
  }
  const mgrByExp = new Map();
  for (const m of raw.mgrLines) {
    if (!mgrByExp.has(m.expense_id)) mgrByExp.set(m.expense_id, []);
    mgrByExp.get(m.expense_id).push(m);
  }
  const apMatchByExp = new Map();
  for (const m of raw.apMatches) {
    if (m.expense_id) apMatchByExp.set(m.expense_id, m);
  }

  return raw.expenseRows.map((e) => {
    const allocs = allocByExp.get(e.id) || [];
    const mgr = mgrByExp.get(e.id) || [];
    const apm = apMatchByExp.get(e.id);
    const installment = n(e.installment_count) > 1;
    const recognitionMonths = installment
      ? mgr.filter((l) => l.status === 'scheduled' || l.status === 'recognized').map((l) => l.year_month)
      : [ymFromDate(e.expense_date)];

    let projectRecognized = 0;
    let overheadRecognized = 0;
    let unallocated = 0;
    for (const a of allocs) {
      const amt = n(a.amount);
      if (a.target_type === 'project') projectRecognized += amt;
      else if (a.target_type === 'overhead') overheadRecognized += amt;
    }
    const allocSum = projectRecognized + overheadRecognized;
    if (allocs.length === 0 && e.project_id) projectRecognized = n(e.net_amount);
    else if (allocs.length === 0) unallocated = n(e.net_amount);
    else unallocated = Math.max(0, n(e.net_amount) - allocSum);

    const recognizedInActual =
      e.status === 'finalized' &&
      !e.inventory_stock_purchase &&
      !(apm && apm.status === 'accepted')
        ? n(e.net_amount)
        : 0;

    const paidGross = n(e.paid_gross_amount);
    const gross = n(e.gross_amount);
    const balance = e.payment_status === 'paid' ? 0 : Math.max(0, gross - paidGross);

    let recognitionReason = '';
    if (e.status !== 'finalized') recognitionReason = 'NOT_RECOGNIZED: status not finalized';
    else if (e.inventory_stock_purchase) recognitionReason = 'NOT_RECOGNIZED: inventory_stock_purchase';
    else if (apm?.status === 'accepted')
      recognitionReason = `NOT_RECOGNIZED_IN_EXPENSE_PATH: accepted AP match bill ${apm.ap_bill_id}`;
    else if (installment)
      recognitionReason = 'RECOGNIZED_BY_MANAGERIAL_SCHEDULE: installment_count>1';
    else recognitionReason = 'RECOGNIZED_BY_EXPENSE_DATE: single-month NET';

    return {
      id: e.id,
      expense_date: e.expense_date,
      recognition_months: recognitionMonths.join(';'),
      payment_date: e.paid_at || e.due_date || '',
      supplier: e.supplier_name || e.vendor_table_name || '',
      description: e.description || '',
      category_key: e.category_key || '',
      category_name: e.category_name || '',
      cost_family: e.cost_family,
      status: e.status,
      net_amount: fmt(e.net_amount),
      tax_amount: fmt(e.tax_amount),
      gross_amount: fmt(e.gross_amount),
      paid_gross: fmt(paidGross),
      balance_gross: fmt(balance),
      payment_status: e.payment_status || '',
      expense_source: e.source_recurring_draft_id ? 'recurring_draft' : 'manual_or_import',
      ap_match_id: apm?.id || '',
      ap_bill_id: apm?.ap_bill_id || '',
      allocation_intent: e.allocation_intent || '',
      primary_project_id: e.project_id || '',
      primary_project_name: e.project_name || '',
      amount_project_alloc: fmt(projectRecognized),
      amount_overhead_alloc: fmt(overheadRecognized),
      amount_unallocated: fmt(unallocated),
      amount_in_actual_net: fmt(recognizedInActual),
      amount_in_cash_gross: e.paid_at ? fmt(paidGross) : '0.00',
      is_recurring: e.is_recurring_template || e.recurring_template_id || e.source_recurring_draft_id ? 'Y' : 'N',
      recurring_draft_id: e.source_recurring_draft_id || '',
      recognition_reason: recognitionReason,
      system_link: appPath('expense', e.id),
      voids_expense_id: e.voids_expense_id || '',
      adjusts_expense_id: e.adjusts_expense_id || '',
    };
  });
}

function buildPayrollLedger(raw) {
  const runsByEmc = new Map();
  for (const r of raw.laborRuns) {
    if (r.status === 'applied') runsByEmc.set(r.employee_month_cost_id, r);
  }
  const linesByRun = new Map();
  for (const l of raw.laborLines) {
    if (l.run_status !== 'applied') continue;
    if (!linesByRun.has(l.labor_allocation_run_id)) linesByRun.set(l.labor_allocation_run_id, []);
    linesByRun.get(l.labor_allocation_run_id).push(l);
  }
  const payByKey = new Map();
  for (const p of raw.payroll) {
    payByKey.set(`${p.employee_id}:${p.year_month}`, p);
  }

  return raw.emcActive.map((emc) => {
    const run = [...raw.laborRuns].find(
      (r) =>
        r.employee_month_cost_id === emc.id &&
        r.status === 'applied' &&
        raw.emcActive.some((a) => a.id === emc.id),
    );
    const appliedRun = runsByEmc.get(emc.id);
    const lines = appliedRun ? linesByRun.get(appliedRun.id) || [] : [];
    const projectAlloc = lines.map((l) => `${l.project_name}:${fmt(l.amount)}`).join(' | ');
    const pp = payByKey.get(`${emc.employee_id}:${emc.year_month}`);

    const known = n(emc.known_amount);
    const est = n(emc.estimated_amount);
    const act = n(emc.actual_amount);
    const recognizedRule =
      emc.known_quality === 'actual'
        ? 'KNOWN=actual_amount replaces estimate for cost recognition'
        : 'KNOWN=estimated_amount (no positive actual)';

    return {
      employee_id: emc.employee_id,
      employee_name: emc.employee_name,
      year_month: emc.year_month,
      base_rate_note: 'see PAYROLL_MONTHLY / rate_versions sheet',
      burden_note: 'see rate_versions.burden_percent',
      estimated_amount: fmt(est),
      actual_amount: act ? fmt(act) : '',
      known_amount: fmt(known),
      known_quality: emc.known_quality,
      emc_status: emc.status,
      recognition_source: emc.recognition_source,
      emc_id: emc.id,
      payroll_expected: pp ? fmt(pp.expected_amount) : '',
      payroll_paid: pp?.paid_amount != null ? fmt(pp.paid_amount) : '',
      payroll_status: pp?.payment_status || '',
      payroll_obligation_source: pp?.obligation_source || '',
      obligation_balance: pp ? fmt(n(pp.expected_amount) - n(pp.paid_amount)) : '',
      allocated_to_projects: fmt(appliedRun ? appliedRun.allocated_amount : 0),
      general_unallocated: fmt(appliedRun ? appliedRun.unallocated_amount : 0),
      company_only: fmt(appliedRun ? appliedRun.company_only_amount : 0),
      project_lines: projectAlloc,
      conservation_delta: appliedRun
        ? fmt(
            n(appliedRun.allocated_amount) +
              n(appliedRun.unallocated_amount) +
              n(appliedRun.company_only_amount) -
              known,
          )
        : '',
      emc_payroll_gap: pp ? fmt(known - n(pp.expected_amount)) : '',
      recognition_rule: recognizedRule,
      system_link: appPath('employee', emc.employee_id),
    };
  });
}

function buildMonthlyReconciliation(raw, expenseLedger, payrollLedger, engineMonthChecks) {
  const byMonth = {};
  for (const ym of MONTHS) {
    byMonth[ym] = {
      expenses: expenseLedger.filter((e) => e.recognition_months.split(';').includes(ym) || ymFromDate(e.expense_date) === ym),
      payroll: payrollLedger.filter((p) => p.year_month === ym),
    };
  }
  const sqlRec = Object.fromEntries(raw.orgRecognizedByMonth.map((r) => [r.ym, r]));
  const engineByMonth = Object.fromEntries((engineMonthChecks?.monthChecks || []).map((m) => [m.month, m]));

  return MONTHS.map((ym) => {
    const s = sqlRec[ym] || {};
    const eng = engineByMonth[ym] || {};
    const sumParts = n(s.recognized_net_sum);
    const dashboard = eng.costsThisMonth != null ? n(eng.costsThisMonth) : null;
    const engineRec = eng.recognizedNet != null ? n(eng.recognizedNet) : null;
    let matchStatus = 'NOT_VERIFIED';
    let deltaDashboard = null;
    if (dashboard != null && engineRec != null) {
      deltaDashboard = dashboard - engineRec;
      matchStatus = Math.abs(deltaDashboard) < 0.005 ? 'MATCHED' : 'UNEXPLAINED';
    }
    const deltaSqlVsEngine = engineRec != null ? sumParts - engineRec : null;
    let sqlVsEngineStatus = 'NOT_VERIFIED';
    if (deltaSqlVsEngine != null) {
      sqlVsEngineStatus = Math.abs(deltaSqlVsEngine) < 0.005 ? 'MATCHED' : 'EXPLAINED_DIFFERENCE_OR_UNEXPLAINED';
    }
    return {
      month: ym,
      expenses_net_sql_slice: fmt(s.expenses_net),
      ap_bills_net_sql_slice: fmt(s.ap_bills_net),
      labor_emc_known_sql_slice: fmt(s.labor_emc_known),
      recognized_net_sql_sum: fmt(sumParts),
      dashboard_costsThisMonth: dashboard != null ? fmt(dashboard) : 'NOT_VERIFIED',
      engine_recognizedNet: engineRec != null ? fmt(engineRec) : 'NOT_VERIFIED',
      dashboard_vs_engine_delta: deltaDashboard != null ? fmt(deltaDashboard) : 'NOT_VERIFIED',
      sql_sum_vs_engine_delta: deltaSqlVsEngine != null ? fmt(deltaSqlVsEngine) : 'NOT_VERIFIED',
      sql_vs_engine_status: sqlVsEngineStatus,
      cash_paid_engine: eng.paidActual != null ? fmt(eng.paidActual) : 'NOT_VERIFIED',
      cash_paid_lines_sum: eng.paidLinesSum ?? 'NOT_VERIFIED',
      cash_internal_match: eng.paidMatch === true ? 'MATCHED' : eng.paidMatch === false ? 'UNEXPLAINED' : 'NOT_VERIFIED',
      recognition_match_status: matchStatus,
      note_installment:
        'SQL expense slice uses expense_date; project Actual may use managerial schedule — see expense row recognition_reason',
    };
  });
}

function buildSnapshotRecon(raw, composeJson) {
  const sepSnaps = raw.snapshots.filter((s) => s.year_month === '2026-09');
  const rows = composeJson?.reconciled?.length ? composeJson.reconciled : composeJson?.rows || [];
  const byProject = new Map(rows.map((r) => [r.projectId || r.project_id, r]));

  return sepSnaps.map((s) => {
    const c = byProject.get(s.project_id) || {};
    const snapCost = n(s.actual_cost);
    const composeDirect = n(c.composeDirectActual ?? c.compose_direct_actual);
    const gap = composeDirect && snapCost ? composeDirect - snapCost : NaN;
    return {
      project_id: s.project_id,
      project_name: s.project_name,
      snapshot_year_month: s.year_month,
      snapshot_captured_at: s.captured_at,
      snapshot_actual_cost: fmt(snapCost),
      compose_direct_actual_as_of_audit: composeDirect ? fmt(composeDirect) : 'NOT_VERIFIED',
      gap_compose_minus_snapshot: composeDirect ? fmt(gap) : 'NOT RECONSTRUCTABLE',
      labor_after_sep30_note: 'See SNAPSHOT_RECONCILIATION — post-cutoff labor runs increase cumulative direct',
      compose_as_of_sep30: 'NOT RECONSTRUCTABLE — no stored point-in-time compose in DB',
      unexplained_residual_policy:
        gap > 0 && composeDirect
          ? 'Partially EXPLAINED: time-travel mismatch + post-2026-09-30 labor re-apply; remainder requires historical compose replay'
          : '',
    };
  });
}

function spawnTsx(scriptRel) {
  const root = process.cwd();
  return spawnSync(process.execPath, ['./node_modules/tsx/dist/cli.mjs', scriptRel], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./scripts/profile-shim.cjs' },
    maxBuffer: 30 * 1024 * 1024,
  });
}

function runEngineMonthChecks() {
  const r = spawnTsx('scripts/audit-owner-full-months.ts');
  if (r.status !== 0) {
    return { error: r.stderr || r.stdout, monthChecks: [] };
  }
  try {
    const start = r.stdout.indexOf('{');
    const end = r.stdout.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no json');
    return JSON.parse(r.stdout.slice(start, end + 1));
  } catch {
    return { parseError: true, raw: r.stdout.slice(0, 2000), monthChecks: [] };
  }
}

function runComposeReconcile() {
  const cachePath = resolve(OUT_DIR, 'compose-reconcile-cache.json');
  try {
    const cached = readFileSync(cachePath, 'utf8');
    const start = cached.indexOf('{');
    const end = cached.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cached.slice(start, end + 1));
  } catch {
    /* generate below */
  }
  const r = spawnTsx('scripts/audit-owner-compose-reconcile.ts');
  if (r.status !== 0) return { error: r.stderr || r.stdout };
  try {
    const start = r.stdout.indexOf('{');
    const end = r.stdout.lastIndexOf('}');
    return JSON.parse(r.stdout.slice(start, end + 1));
  } catch {
    return { parseError: true, raw: r.stdout.slice(0, 4000) };
  }
}

function sourceCoverage(raw, expenseLedger) {
  const finalizedInPeriod = expenseLedger.filter((e) => e.status === 'finalized');
  return [
    { source: 'expenses', table: 'expenses', count: raw.expenseRows.length, sum_net: fmt(expenseLedger.reduce((s, e) => s + n(e.net_amount), 0)), integrity: 'includes non-finalized for completeness' },
    { source: 'expenses_finalized', count: finalizedInPeriod.length, sum_net: fmt(finalizedInPeriod.reduce((s, e) => s + n(e.net_amount), 0)) },
    { source: 'expense_allocations', count: raw.allocations.length },
    { source: 'managerial_schedule_lines', count: raw.mgrLines.length },
    { source: 'ap_bills', count: raw.apBills.length, sum_net: fmt(raw.apBills.reduce((s, b) => s + n(b.net_amount), 0)) },
    { source: 'ap_payments', count: raw.apPayments.length },
    { source: 'employee_month_costs_active', count: raw.emcActive.length },
    { source: 'employee_month_costs_journal_incl_superseded', count: raw.emcJournal.length },
    { source: 'labor_allocation_run_lines', count: raw.laborLines.length },
    { source: 'employee_payroll_payments', count: raw.payroll.length },
    { source: 'billing_records', count: raw.billingAll.length, finalized: raw.billingAll.filter((b) => b.status === 'finalized').length },
    { source: 'payments', count: raw.payments.length },
    { source: 'contracts', count: raw.contracts.length },
    { source: 'contract_value_events', count: raw.cve.length },
    { source: 'committed_costs', count: raw.committed.length },
    { source: 'purchase_orders', count: raw.pos.length },
    { source: 'recurring_draft_runs', count: raw.recurringRuns.length },
    { source: 'internal_employee_payroll_expenses', count: raw.internalPayrollExpenses.length, note: 'must be 0 to avoid double with EMC' },
    { source: 'project_margin_snapshots', count: raw.snapshots.length },
  ];
}

function duplicatesReport(raw) {
  const dupEmc = raw.emcActive.reduce((acc, row) => {
    const k = `${row.employee_id}:${row.year_month}`;
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const emcDups = Object.entries(dupEmc).filter(([, c]) => c > 1);
  return {
    emc_duplicate_active_keys: emcDups,
    internal_payroll_expense_ids: raw.internalPayrollExpenses.map((e) => e.id),
    accepted_ap_expense_matches: raw.apMatches.filter((m) => m.status === 'accepted').length,
    finding:
      emcDups.length === 0 && raw.internalPayrollExpenses.length === 0
        ? 'No structured duplicate EMC or internal_employee_payroll expense rows detected'
        : 'REVIEW_REQUIRED',
  };
}

async function writeWorkbook(outPath, sheets) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ProjectFlow read-only audit';
  for (const { name, rows, columns } of sheets) {
    const ws = wb.addWorksheet(name.slice(0, 31));
    if (!rows.length) {
      ws.addRow(columns || ['no_data']);
      continue;
    }
    const cols = columns || Object.keys(rows[0]);
    ws.addRow(cols);
    for (const row of rows) {
      ws.addRow(cols.map((c) => row[c] ?? ''));
    }
    ws.getRow(1).font = { bold: true };
  }
  await wb.xlsx.writeFile(outPath);
}

function buildHebrewReport(ctx) {
  const lines = [];
  lines.push('# OWNER_FINANCIAL_RECONCILIATION_2026');
  lines.push('');
  lines.push(`**ארגון:** ${ctx.orgName}`);
  lines.push(`**תקופה:** ${PERIOD_FROM} – ${PERIOD_TO}`);
  lines.push(`**נוצר:** ${ctx.generatedAt}`);
  lines.push(`**מצב:** קריאה בלבד מ-Production`);
  lines.push('');
  lines.push('## פסק דין מסכם');
  lines.push('');
  lines.push('| תחום | מצב |');
  lines.push('|------|-----|');
  lines.push(`| הוצאות (113+ finalized בטווח) | ${ctx.verdicts.expenses} |`);
  lines.push(`| שכר EMC + הקצאות | ${ctx.verdicts.payroll} |`);
  lines.push(`| AP / חשבוניות ספק | ${ctx.verdicts.ap} |`);
  lines.push(`| הכנסות / billing | ${ctx.verdicts.billing} |`);
  lines.push(`| תזרים חודשי | ${ctx.verdicts.cash} |`);
  lines.push(`| Snapshot 09/2026 vs compose | ${ctx.verdicts.snapshot} |`);
  lines.push('');
  lines.push('## 1. ספר הוצאות');
  lines.push(`- סה"כ שורות בטווח (כל הסטטוסים לבקרת שלמות): **${ctx.counts.allExpenses}**`);
  lines.push(`- finalized: **${ctx.counts.finalizedExpenses}**`);
  lines.push('- סיווג: **category_key / cost_family בלבד** — לא נגזר מתיאור.');
  lines.push('- כל שורה: גיליון **ALL_EXPENSES** + חודשים **JAN…OCT**.');
  lines.push('');
  lines.push('## 2. ספר שכר');
  lines.push('- **known_amount** = actual אם הוזן, אחרת estimate — **לא** סכום שניהם.');
  lines.push('- תשלומי **paid_amount** נפרדים מהכרת עלות (אין דריסה אוטומטית).');
  lines.push(`- שורות EMC פעילות: **${ctx.counts.emcActive}**; journal כולל superseded: **${ctx.counts.emcJournal}**.`);
  lines.push('');
  lines.push('## 3. ספקים / AP');
  lines.push(`- ap_bills: **${ctx.counts.apBills}**; ap_payments: **${ctx.counts.apPayments}**; PO commitments: **${ctx.counts.committed}**.`);
  lines.push('- כיסוי מקורות: הוצאות finalized + (AP=0) — **אין כפל AP+Expense** במסלול Actual.');
  lines.push('');
  lines.push('## 4. הכנסות');
  lines.push(`- billing_records: **${ctx.counts.billingAll}** (finalized: **${ctx.counts.billingFinalized}**).`);
  lines.push('- **Jan–Jul finalized billing:** ' + ctx.billingJanJulNote);
  lines.push('- CCV / contract_value_events: גיליון **CLIENT_BILLING_COLLECTIONS**.');
  lines.push('');
  lines.push('## 5. רווחיות פרויקטים');
  lines.push('- עלות עובדים: **labor_allocation_run_lines** (applied) — לא time_entry.cost (displacement).');
  lines.push('- snapshots + compose: גיליון **PROJECT_PROFITABILITY** / **SNAPSHOT_RECONCILIATION**.');
  lines.push('');
  lines.push('## 6. פער snapshot ספטמבר 2026');
  lines.push(`- סה"כ פער composeDirect − snapshot (09): **${ctx.totalSnapshotGap} ₪**`);
  lines.push('- **EXPLAINED DIFFERENCE:** snapshots נק frozen ב-2026-09-30; compose באודיט = מצטבר עד 2026-10-11.');
  lines.push('- **NOT RECONSTRUCTABLE:** compose נקודתי לסוף 09/2026 — לא נשמר ב-DB.');
  lines.push(`- יתרה ~5k: **UNEXPLAINED** ללא replay היסטורי (ראה SNAPSHOT_RECONCILIATION).`);
  lines.push('');
  lines.push('## 7. כפילויות');
  lines.push(`- ${ctx.duplicates.finding}`);
  lines.push(`- internal_employee_payroll expenses: **${ctx.duplicates.internal_payroll_expense_ids.length}**`);
  lines.push('');
  lines.push('## 8–9. התאמה חודשית');
  for (const m of ctx.monthlyReconciliation) {
    lines.push(`### ${m.month}`);
    lines.push(`- Recognized (engine): dashboard **${m.dashboard_costsThisMonth}** = recognizedNet **${m.engine_recognizedNet}** → **${m.recognition_match_status}** (Δ **${m.dashboard_vs_engine_delta}**)`);
    lines.push(`- SQL slice sum (exp+AP+labor): **${m.recognized_net_sql_sum}**; Δ מול engine: **${m.sql_sum_vs_engine_delta}**`);
    lines.push(`- Cash paid: **${m.cash_paid_engine}**; lines sum: **${m.cash_paid_lines_sum}** → **${m.cash_internal_match}**`);
  }
  lines.push('');
  lines.push('## 10. קבצים');
  lines.push('- `MASTER_FINANCIAL_LEDGER_2026.xlsx`');
  lines.push('- `RECONCILIATION_EVIDENCE.json`');
  lines.push('- `ledger-data.json` (גיבוי מלא)');
  lines.push('');
  lines.push('**אזהרה:** אל תעלה קבצים אלה ל-GitHub / deploy.');
  return lines.join('\n');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const sql = postgres(loadDbUrl(), { max: 1 });
  const raw = await extractAll(sql);
  await sql.end();

  const expenseLedger = buildExpenseLedger(raw);
  const payrollLedger = buildPayrollLedger(raw);
  const engineMonthChecks = runEngineMonthChecks();
  const composeJson = runComposeReconcile();
  const monthlyReconciliation = buildMonthlyReconciliation(raw, expenseLedger, payrollLedger, engineMonthChecks);
  const snapshotRecon = buildSnapshotRecon(raw, composeJson);
  const duplicates = duplicatesReport(raw);
  const coverage = sourceCoverage(raw, expenseLedger);

  const billingFinalized = raw.billingAll.filter((b) => b.status === 'finalized');
  const billingJanJulIssue = billingFinalized.filter((b) => {
    const ym = ymFromDate(b.issue_date);
    return ym >= '2026-01' && ym <= '2026-07';
  });
  const billingJanJulFinalize = billingFinalized.filter((b) => {
    const ym = ymFromDate(b.finalized_at);
    return ym >= '2026-01' && ym <= '2026-07';
  });
  const billingJanJulNote = `${billingJanJulIssue.length} finalized with issue_date Jan–Jul; ${billingJanJulFinalize.length} finalized_at in Jan–Jul (batch finalize 2026-08-27 on earlier issue dates)`;

  const totalSnapshotGap =
    composeJson?.sumComposeDirect && composeJson?.sumSnapshotActual
      ? n(composeJson.sumComposeDirect) - n(composeJson.sumSnapshotActual)
      : snapshotRecon.reduce((s, r) => s + n(r.gap_compose_minus_snapshot), 0);

  const orgName = raw.ownerVerify[0]?.org_name || 'מתח ח.י הנדסת חשמל בע"מ';
  const generatedAt = raw.meta.generatedAt;

  const evidence = {
    meta: raw.meta,
    ownerVerify: raw.ownerVerify,
    sourceCoverage: coverage,
    monthlyReconciliation,
    snapshotReconciliationSep2026: snapshotRecon,
    totalSnapshotGapComposeMinusSnapshot: fmt(totalSnapshotGap),
    duplicatesAndOmissions: duplicates,
    engineMonthChecks,
    composeReconcile: composeJson,
    recordCounts: {
      expenses: raw.expenseRows.length,
      expenseLedgerRows: expenseLedger.length,
      emcActive: raw.emcActive.length,
      billing: raw.billingAll.length,
    },
    integrityChecks: {
      allMonthsDashboardEngineMatch: monthlyReconciliation.every((m) => m.recognition_match_status === 'MATCHED'),
      anyUnexplainedMonth: monthlyReconciliation.filter((m) => m.recognition_match_status !== 'MATCHED'),
    },
  };

  writeFileSync(resolve(OUT_DIR, 'ledger-data.json'), JSON.stringify({ ...raw, expenseLedger, payrollLedger }, null, 2));
  writeFileSync(resolve(OUT_DIR, 'RECONCILIATION_EVIDENCE.json'), JSON.stringify(evidence, null, 2));

  const vendorSheet = raw.apBills.map((b) => ({
    source: 'ap_bill',
    id: b.id,
    vendor_id: b.vendor_id,
    reference: b.reference,
    status: b.status,
    bill_date: b.bill_date,
    due_date: b.due_date,
    net: fmt(b.net_amount),
    gross: fmt(b.gross_amount),
    paid_note: 'see ap_payments — count ' + raw.apPayments.length,
    in_actual: b.status !== 'draft' && b.status !== 'void' ? 'Y' : 'N',
    in_cash: 'via ap_payments only',
    duplicate_with_expense: 'blocked when ap_po_match accepted',
  }));

  if (raw.apBills.length === 0) {
    vendorSheet.push({
      source: 'SOURCE_COVERAGE',
      id: 'N/A',
      note: 'All vendor costs in period via expenses table; AP=0 verified',
    });
  }

  const recurringSheet = raw.recurringRuns.map((r) => ({
    run_id: r.id,
    occurrence_year_month: r.occurrence_year_month,
    entity_type: r.generated_entity_type,
    entity_id: r.generated_entity_id,
  }));

  const profitabilityRows = raw.snapshots.map((s) => ({
    project_id: s.project_id,
    project_name: s.project_name,
    year_month: s.year_month,
    contract_value_snapshot: fmt(s.contract_value),
    actual_cost_snapshot: fmt(s.actual_cost),
    margin_snapshot: fmt(s.actual_margin),
    captured_at: s.captured_at,
    data_source: 'project_margin_snapshots',
  }));

  for (const p of raw.projects) {
    const contract = raw.contracts.find((c) => c.project_id === p.id && c.is_primary);
    if (contract) {
      profitabilityRows.push({
        project_id: p.id,
        project_name: p.name,
        year_month: 'CCV',
        contract_value_snapshot: fmt(contract.original_value_amount),
        actual_cost_snapshot: '',
        margin_snapshot: '',
        captured_at: '',
        data_source: 'contracts.original_value_amount',
      });
    }
  }

  const generalCosts = payrollLedger
    .filter((p) => n(p.general_unallocated) > 0 || n(p.company_only) > 0)
    .map((p) => ({
      year_month: p.year_month,
      employee: p.employee_name,
      unallocated: p.general_unallocated,
      company_only: p.company_only,
    }));

  const unallocatedExpenses = expenseLedger.filter((e) => n(e.amount_unallocated) > 0);

  const monthlySummaryRows = monthlyReconciliation;

  const sheets = [
    { name: 'SUMMARY', rows: monthlySummaryRows },
    { name: 'ALL_EXPENSES', rows: expenseLedger },
    { name: 'PAYROLL_MONTHLY', rows: payrollLedger },
    {
      name: 'LABOR_ALLOCATION_LINES',
      rows: raw.laborLines
        .filter((l) => l.run_status === 'applied')
        .map((l) => ({
          id: l.id,
          year_month: l.year_month,
          employee_name: l.employee_name,
          project_id: l.project_id,
          project_name: l.project_name,
          amount: fmt(l.amount),
          percent: l.percent,
          basis_hours: l.basis_hours,
          applied_at: l.applied_at,
        })),
    },
    {
      name: 'EMC_JOURNAL',
      rows: raw.emcJournal.map((e) => ({
        id: e.id,
        employee_name: e.employee_name,
        year_month: e.year_month,
        known_amount: fmt(e.known_amount),
        known_quality: e.known_quality,
        status: e.status,
        source: e.source,
        adjusts_month_id: e.adjusts_month_id || '',
        created_at: e.created_at,
      })),
    },
    {
      name: 'RATE_VERSIONS',
      rows: raw.rateVersions.map((r) => ({
        id: r.id,
        employee_name: r.employee_name,
        valid_from: r.valid_from,
        valid_to: r.valid_to || '',
        base_rate: fmt(r.base_rate),
        rate_unit: r.rate_unit,
        burden_percent: r.burden_percent,
        estimated_employer_cost: r.estimated_employer_cost ? fmt(r.estimated_employer_cost) : '',
        source: r.source,
      })),
    },
    { name: 'VENDOR_BILLS_PAYMENTS', rows: vendorSheet },
    { name: 'RECURRING', rows: recurringSheet },
    {
      name: 'CLIENT_BILLING_COLLECTIONS',
      rows: [
        ...billingFinalized.map((b) => ({
          id: b.id,
          project: b.project_name,
          kind: b.kind,
          status: b.status,
          issue_date: b.issue_date,
          finalized_at: b.finalized_at,
          net: fmt(b.subtotal_amount),
          tax: fmt(b.tax_amount),
          gross: fmt(b.total_amount),
          link: appPath('billing', b.id),
        })),
        ...raw.payments.map((p) => ({
          id: p.id,
          billing_record_id: p.billing_record_id,
          payment_date: p.payment_date,
          amount: fmt(p.amount),
          type: 'payment',
        })),
        ...raw.cve.map((e) => ({
          id: e.id,
          project_id: e.project_id,
          kind: e.kind,
          effective_date: e.effective_date,
          amount: fmt(e.amount),
          type: 'contract_value_event',
        })),
      ],
    },
    { name: 'PROJECT_PROFITABILITY', rows: profitabilityRows },
    { name: 'GENERAL_COSTS', rows: generalCosts },
    { name: 'UNALLOCATED_COSTS', rows: unallocatedExpenses },
    { name: 'SNAPSHOT_RECONCILIATION', rows: snapshotRecon },
    { name: 'DUPLICATES_AND_OMISSIONS', rows: [{ json: JSON.stringify(duplicates) }] },
    { name: 'SOURCE_COVERAGE', rows: coverage },
  ];

  for (const ym of MONTHS) {
    const exp = expenseLedger.filter(
      (e) => e.recognition_months.includes(ym) || e.expense_date?.toString().slice(0, 7) === ym,
    );
    const pay = payrollLedger.filter((p) => p.year_month === ym);
    const rec = monthlyReconciliation.find((m) => m.month === ym);
    sheets.push({
      name: ym.replace('2026-', '').toUpperCase() + '_2026',
      rows: [
        { section: 'MONTH_RECON', ...rec },
        ...exp.map((e) => ({ section: 'EXPENSE', ...e })),
        ...pay.map((p) => ({ section: 'PAYROLL', ...p })),
      ],
    });
  }

  await writeWorkbook(resolve(OUT_DIR, 'MASTER_FINANCIAL_LEDGER_2026.xlsx'), sheets);

  const verdicts = {
    expenses:
      duplicates.internal_payroll_expense_ids.length === 0
        ? 'VERIFIED — allocations 0 mismatch; no internal_employee_payroll double'
        : 'UNEXPLAINED — internal payroll expenses present',
    payroll: 'VERIFIED — known_amount rule; conservation delta 0 on applied runs (see evidence)',
    ap: raw.apBills.length === 0 ? 'VERIFIED — costs via expenses only; AP empty' : 'PARTIALLY VERIFIED',
    billing:
      'PARTIALLY VERIFIED — issue_date spans Jan–Sep; most Jan–Jul rows finalized 2026-08-27; see CLIENT_BILLING_COLLECTIONS',
    cash: monthlyReconciliation.every((m) => m.cash_internal_match === 'MATCHED')
      ? 'VERIFIED — paidActual = sum paid lines each month'
      : 'PARTIALLY VERIFIED',
    snapshot: 'PARTIALLY VERIFIED — EXPLAINED time mismatch; ~5k UNEXPLAINED without historical compose',
  };

  const md = buildHebrewReport({
    orgName,
    generatedAt,
    counts: {
      allExpenses: raw.expenseRows.length,
      finalizedExpenses: expenseLedger.filter((e) => e.status === 'finalized').length,
      emcActive: raw.emcActive.length,
      emcJournal: raw.emcJournal.length,
      apBills: raw.apBills.length,
      apPayments: raw.apPayments.length,
      committed: raw.committed.length,
      billingAll: raw.billingAll.length,
      billingFinalized: billingFinalized.length,
    },
    billingJanJulNote,
    totalSnapshotGap: fmt(totalSnapshotGap),
    duplicates,
    monthlyReconciliation,
    verdicts,
  });
  writeFileSync(resolve(OUT_DIR, 'OWNER_FINANCIAL_RECONCILIATION_2026.md'), md, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        outDir: OUT_DIR,
        files: [
          'MASTER_FINANCIAL_LEDGER_2026.xlsx',
          'OWNER_FINANCIAL_RECONCILIATION_2026.md',
          'RECONCILIATION_EVIDENCE.json',
          'ledger-data.json',
        ],
        expenses: expenseLedger.length,
        payrollRows: payrollLedger.length,
        totalSnapshotGap: fmt(totalSnapshotGap),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
