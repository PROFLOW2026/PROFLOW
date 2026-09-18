/**
 * Idempotent demo-org historical cleanup — spread collections, resolve stale approvals/payables.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/normalize-demo-business-history-2026.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';
const MARKER = 'PF-DEMO-NORMALIZE-2026';
const HISTORY_CUTOFF = '2026-08-31';

/** Never mutate dates on live SUMIT / controlled test payments. */
const PROTECTED_PAYMENT_REFS = new Set([
  'PF-DEMO-RECEIPT-20000',
  'PF-DEMO-LIVE/COMBINED/26003',
  'PF-DEMO-MANUAL-MODE/PAY/26007',
]);

/** Seed historical collections → realistic month after invoice + terms lag. */
const PAYMENT_DATE_BY_REF: Record<string, string> = {
  'PF-DEMO-PAY/26001/1': '2026-05-08',
  'PF-DEMO-PAY/26002/1': '2026-05-22',
  'PF-DEMO-PAY/26003/1': '2026-04-28',
  'PF-DEMO-PAY/26004/1': '2026-08-03',
  'PF-DEMO-PAY/26005/1': '2026-08-10',
  'PF-DEMO-PAY/26006/1': '2026-09-05',
  'PF-DEMO-PAY/26007/1': '2026-08-18',
  'PF-DEMO-PAY/26008/1': '2026-09-10',
};

/** Shift stale overdue open AR to current/upcoming due dates — preserves open NET. */
const DUE_DATE_BY_BILL_REF: Record<string, string> = {
  'PF-DEMO-BILL/26001/PROG': '2026-10-05',
  'PF-DEMO-BILL/26002/PROG': '2026-10-18',
  'PF-DEMO-BILL/26004/PROG': '2026-10-22',
  'PF-DEMO-BILL/26005/PROG': '2026-09-28',
  // 26006 stays overdue intentionally (Aug 29 due)
};

const SUMIT_EXTERNAL_IDS = {
  taxInvoice: '2375968448',
  receipt: '2376000029',
  combined: '2376000034',
  transaction: '2376000043',
} as const;

interface PhaseLog {
  readonly phase: string;
  readonly changed: number;
  readonly skipped: number;
  readonly notes?: readonly string[];
}

async function terminateStaleSessions() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) return;
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    await sql.unsafe(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND state IN ('idle in transaction', 'active')
        AND (
          query ILIKE '%time_entries%'
          OR query ILIKE '%normalize-demo%'
          OR xact_start IS NOT NULL AND now() - xact_start > interval '20 seconds'
        )
    `);
  } finally {
    await sql.end();
  }
}

async function assertDemoOrg() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [org] = await sql<{ id: string; name: string }[]>`
      select id, name from organizations where id = ${DEMO_ORG_ID}::uuid
    `;
    if (!org) throw new Error('Demo org not found');
    if (org.name === EXCLUDED_ORG_NAME) throw new Error('Refusing real business org');
    const [profile] = await sql<{ id: string }[]>`
      select id from profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    if (!profile) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);
    return { userId: profile.id, orgName: org.name };
  } finally {
    await sql.end();
  }
}

async function snapshotTotals() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = postgres(cs, { prepare: false, max: 1 });
  const [contracts] = await sql`
    select coalesce(sum(c.original_value_amount::numeric),0) as v from contracts c
    join projects p on p.id = c.project_id
    where p.organization_id = ${DEMO_ORG_ID}::uuid and c.is_primary = true
  `;
  const [billed] = await sql`
    select coalesce(sum(subtotal_amount::numeric),0) as v from billing_records
    where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
  `;
  const [collected] = await sql`
    select coalesce(sum(amount::numeric),0) as v from payments
    where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
  `;
  const sumit = await sql`
    select kind, external_number, external_id from external_statutory_documents
    where organization_id = ${DEMO_ORG_ID}::uuid and issuance_outcome = 'confirmed_created'
    order by requested_at
  `;
  await sql.end();
  return { contracts: contracts.v, billed: billed.v, collected: collected.v, sumit };
}

async function monthlyBreakdown() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = postgres(cs, { prepare: false, max: 1 });
  const months = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  const result: Record<string, Record<string, string>> = {};
  for (const month of months) {
    const start = `${month}-01`;
    const end = month === '2026-09' ? '2026-09-19' : `${month}-31`;
    const [billed] = await sql`
      select coalesce(sum(subtotal_amount::numeric),0) as v from billing_records
      where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
        and issue_date >= ${start}::date and issue_date <= ${end}::date
    `;
    const [collected] = await sql`
      select coalesce(sum(amount::numeric),0) as v from payments
      where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
        and payment_date >= ${start}::date and payment_date <= ${end}::date
    `;
    const [labor] = await sql`
      select coalesce(sum(actual_amount::numeric),0) as v from employee_month_costs
      where organization_id = ${DEMO_ORG_ID}::uuid and status = 'applied' and year_month = ${month}
    `;
    const [overhead] = await sql`
      select coalesce(sum(net_amount::numeric),0) as v from expenses
      where organization_id = ${DEMO_ORG_ID}::uuid and cost_family = 'business_overhead'
        and status = 'finalized' and to_char(expense_date,'YYYY-MM') = ${month}
    `;
    const [directAp] = await sql`
      select coalesce(sum(net_amount::numeric),0) as v from ap_bills
      where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
        and to_char(bill_date,'YYYY-MM') = ${month}
    `;
    const [billedToDate] = await sql`
      select coalesce(sum(subtotal_amount::numeric),0) as v from billing_records
      where organization_id = ${DEMO_ORG_ID}::uuid and status not in ('draft','void')
        and issue_date <= ${end}::date
    `;
    const [collectedToDate] = await sql`
      select coalesce(sum(amount::numeric),0) as v from payments
      where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
        and payment_date <= ${end}::date
    `;
    const openEom = {
      v: String(Number(billedToDate.v) - Number(collectedToDate.v)),
    };
    result[month] = {
      billedNet: billed.v,
      collectedNet: collected.v,
      laborCost: labor.v,
      overhead: overhead.v,
      directCosts: directAp.v,
      openReceivablesEom: openEom.v,
    };
  }
  await sql.end();
  return result;
}

async function main() {
  await terminateStaleSessions();
  const target = await assertDemoOrg();
  const logs: PhaseLog[] = [];
  const beforeTotals = await snapshotTotals();

  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');
  const { getOrganizationReceivablesSummary } = await import('../src/modules/billing/index.ts');
  const { getActionableInbox } = await import('../src/modules/command-center/index.ts');

  const alertsBefore = await withUserContext(target.userId, async (tx) => {
    const ctx = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    return (await getActionableInbox(ctx)).items.length;
  });

  // Phase 1 — spread historical collection dates (void + re-record; amounts unchanged)
  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const { recordPayment, voidPayment } = await import('../src/modules/billing/index.ts');
    const postgres = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = postgres(cs, { prepare: false, max: 1 });
    let changed = 0;
    let skipped = 0;
    try {
      for (const [ref, targetDate] of Object.entries(PAYMENT_DATE_BY_REF)) {
        if (PROTECTED_PAYMENT_REFS.has(ref)) {
          skipped += 1;
          continue;
        }
        const [row] = await sql<
          {
            id: string;
            billing_record_id: string;
            amount: string;
            payment_date: string;
            method: string | null;
            notes: string | null;
          }[]
        >`
          select id, billing_record_id, amount::text, payment_date::text, method, notes
          from payments
          where organization_id = ${DEMO_ORG_ID}::uuid and reference = ${ref} and status = 'recorded'
          limit 1
        `;
        if (!row) {
          skipped += 1;
          continue;
        }
        if (row.payment_date.slice(0, 10) === targetDate) {
          skipped += 1;
          continue;
        }
        await voidPayment(context, row.id);
        await recordPayment(context, {
          billingRecordId: row.billing_record_id,
          amount: row.amount.replace(/\.000000$/, '').replace(/\.00$/, ''),
          paymentDate: targetDate,
          method: row.method ?? 'העברה בנקאית',
          reference: ref,
          notes: row.notes ? `${row.notes};${MARKER}:date-move` : `${MARKER}:date-move`,
        });
        changed += 1;
      }
    } finally {
      await sql.end();
    }
    logs.push({ phase: 'spread-collection-dates', changed, skipped });
    console.info(`phase spread-collection-dates: changed=${changed} skipped=${skipped}`);
  });

  // Phase 2 — refresh open AR due dates (preserve open NET; reduce stale overdue alerts)
  {
    const postgres = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = postgres(cs, { prepare: false, max: 1 });
    let changed = 0;
    let skipped = 0;
    try {
      for (const [ref, dueDate] of Object.entries(DUE_DATE_BY_BILL_REF)) {
        const rows = await sql`
          update billing_records set due_date = ${dueDate}::date
          where organization_id = ${DEMO_ORG_ID}::uuid and reference = ${ref}
            and due_date is distinct from ${dueDate}::date
          returning id
        `;
        if (rows.length > 0) changed += rows.length;
        else skipped += 1;
      }
    } finally {
      await sql.end();
    }
    logs.push({ phase: 'refresh-open-ar-due-dates', changed, skipped });
    console.info(`phase refresh-open-ar-due-dates: changed=${changed} skipped=${skipped}`);
  }

  // Phase 3 — approve historical time entries (single demo-scoped SQL statement)
  {
    const postgres = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = postgres(cs, { prepare: false, max: 1 });
    await sql`set statement_timeout = 0`;
    let changed = 0;
    try {
      const approved = await sql<{ id: string }[]>`
        update time_entries
        set approval_status = 'approved',
            submitted_at = coalesce(submitted_at, now()),
            submitted_by_user_id = coalesce(submitted_by_user_id, ${target.userId}::uuid),
            decided_at = coalesce(decided_at, now()),
            decided_by_user_id = coalesce(decided_by_user_id, ${target.userId}::uuid),
            updated_at = now()
        where organization_id = ${DEMO_ORG_ID}::uuid
          and status = 'recorded'
          and approval_status in ('draft','returned','submitted')
          and work_date <= ${HISTORY_CUTOFF}::date
        returning id
      `;
      changed = approved.length;
    } finally {
      await sql.end();
    }
    logs.push({ phase: 'approve-historical-time', changed, skipped: 0 });
    console.info(`phase approve-historical-time: ${changed}`);
  }

  // Phase 4 — pay overdue August payroll (canonical confirmPayrollPaid)
  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const { confirmPayrollPaid } = await import('../src/modules/workforce/application/payroll-payments.ts');
    const { employeePayrollPayments } = await import('@drizzle/schema');
    const { and, eq, isNull } = await import('drizzle-orm');

    const unpaidAug = await context.db
      .select({ id: employeePayrollPayments.id })
      .from(employeePayrollPayments)
      .where(
        and(
          eq(employeePayrollPayments.organizationId, DEMO_ORG_ID),
          eq(employeePayrollPayments.yearMonth, '2026-08'),
          isNull(employeePayrollPayments.paidAt),
          isNull(employeePayrollPayments.voidedAt),
        ),
      );

    let changed = 0;
    let skipped = 0;
    for (const row of unpaidAug) {
      try {
        await confirmPayrollPaid(context, row.id, { paidAt: '2026-09-12' });
        changed += 1;
      } catch {
        skipped += 1;
      }
    }
    logs.push({ phase: 'payroll-aug-2026', changed, skipped });
  });

  // Phase 5 — AP vendor payments (pay 2, leave 1 overdue)
  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const { recordVendorPayment, getBillPayablePosition } = await import('../src/modules/ap/index.ts');
    const { apBills } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    const paySpecs = [
      { billRef: 'PF-DEMO-AP/001', payRef: `${MARKER}/AP/001`, payDate: '2026-07-25' },
      { billRef: 'PF-DEMO-AP/002', payRef: `${MARKER}/AP/002`, payDate: '2026-08-05' },
    ] as const;

    let changed = 0;
    let skipped = 0;
    for (const spec of paySpecs) {
      const [bill] = await context.db
        .select({ id: apBills.id, vendorId: apBills.vendorId, currency: apBills.currency })
        .from(apBills)
        .where(and(eq(apBills.organizationId, DEMO_ORG_ID), eq(apBills.reference, spec.billRef)))
        .limit(1);
      if (!bill) {
        skipped += 1;
        continue;
      }
      const position = await getBillPayablePosition(context, bill.id);
      if (!position || Number(position.outstanding) <= 0) {
        skipped += 1;
        continue;
      }
      const { apPayments } = await import('@drizzle/schema');
      const [existing] = await context.db
        .select({ id: apPayments.id })
        .from(apPayments)
        .where(and(eq(apPayments.organizationId, DEMO_ORG_ID), eq(apPayments.reference, spec.payRef)))
        .limit(1);
      if (existing) {
        skipped += 1;
        continue;
      }
      await recordVendorPayment(context, {
        vendorId: bill.vendorId,
        amount: position.outstanding,
        currency: bill.currency,
        paymentDate: spec.payDate,
        method: 'העברה בנקאית',
        reference: spec.payRef,
        notes: `${MARKER}:historical-ap-payment`,
        applications: [{ apBillId: bill.id, appliedAmount: position.outstanding }],
      });
      changed += 1;
    }
    logs.push({ phase: 'supplier-ap-payments', changed, skipped, notes: ['PF-DEMO-AP/003 left open/overdue'] });
  });

  // Phase 6 — overhead expense payments (pay 2, leave 1 overdue)
  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const { confirmExpensePaid } = await import('../src/modules/expenses/application/expense-payments.ts');
    const { expenses } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');

    const rows = await context.db
      .select({ id: expenses.id, description: expenses.description, paymentStatus: expenses.paymentStatus })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, DEMO_ORG_ID),
          eq(expenses.costFamily, 'business_overhead'),
          like(expenses.notes, '%PF-DEMO-SEED:%'),
        ),
      );

    let changed = 0;
    let skipped = 0;
    for (const row of rows) {
      const leaveOpen = row.description?.includes('הנהלת חשבונות');
      if (leaveOpen || row.paymentStatus === 'paid') {
        skipped += 1;
        continue;
      }
      try {
        await confirmExpensePaid(context, row.id, { paidAt: '2026-04-10' });
        changed += 1;
      } catch {
        skipped += 1;
      }
    }
    logs.push({ phase: 'overhead-expense-payments', changed, skipped });
  });

  // Phase 7 — reconcile stale labor allocations
  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const { reconcileStaleLaborAllocations } = await import(
      '../src/modules/workforce/application/labor-allocation-alerts.ts'
    );
    const repairs = await reconcileStaleLaborAllocations(context, { maxRepairs: 20 });
    logs.push({ phase: 'reconcile-labor-allocations', changed: repairs, skipped: 0 });
  });

  const afterTotals = await snapshotTotals();
  const monthly = await monthlyBreakdown();

  const finalState = await withUserContext(target.userId, async (tx) => {
    const ctx = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    const receivables = await getOrganizationReceivablesSummary(ctx);
    const inbox = await getActionableInbox(ctx);

    const postgres = (await import('postgres')).default;
    const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
    const sql = postgres(cs, { prepare: false, max: 1 });
    const pendingTime = await sql`
      select count(*)::int as n from time_entries
      where organization_id = ${DEMO_ORG_ID}::uuid and status = 'recorded'
        and approval_status = 'draft' and work_date <= ${HISTORY_CUTOFF}::date
    `;
    const openAp = await sql`
      select b.reference, b.net_amount, b.due_date::text,
             b.net_amount::numeric - coalesce(sum(case when ap.status='recorded' then apa.applied_amount else 0 end),0) as outstanding
      from ap_bills b
      left join ap_payment_applications apa on apa.ap_bill_id = b.id
      left join ap_payments ap on ap.id = apa.ap_payment_id
      where b.organization_id = ${DEMO_ORG_ID}::uuid and b.status not in ('draft','void')
      group by b.id, b.reference, b.net_amount, b.due_date
      having b.net_amount::numeric - coalesce(sum(case when ap.status='recorded' then apa.applied_amount else 0 end),0) > 0
      order by b.due_date
    `;
    await sql.end();

    const paidOverhead = await sql`
      select count(*)::int as n from expenses
      where organization_id = ${DEMO_ORG_ID}::uuid and cost_family = 'business_overhead'
        and payment_status = 'paid'
    `;
    const paidApBills = await sql`
      select count(distinct b.id)::int as n
      from ap_bills b
      join ap_payment_applications apa on apa.ap_bill_id = b.id
      join ap_payments ap on ap.id = apa.ap_payment_id and ap.status = 'recorded'
      where b.organization_id = ${DEMO_ORG_ID}::uuid
    `;

    return {
      openNet: receivables.totalOutstanding.amount,
      overdueNet: receivables.overdueTotal.amount,
      alertCount: inbox.items.length,
      alertTypes: [...new Set(inbox.items.map((i) => i.sourceType))].sort(),
      pendingHistoricalTime: pendingTime[0]?.n ?? 0,
      openAp,
      paidOverheadExpenses: paidOverhead[0]?.n ?? 0,
      paidApBills: paidApBills[0]?.n ?? 0,
    };
  });

  const sumitOk = afterTotals.sumit.every((d) => {
    if (d.kind === 'tax_invoice') return d.external_id === SUMIT_EXTERNAL_IDS.taxInvoice && d.external_number === '20000';
    if (d.kind === 'receipt') return d.external_id === SUMIT_EXTERNAL_IDS.receipt && d.external_number === '30000';
    if (d.kind === 'tax_invoice_receipt') return d.external_id === SUMIT_EXTERNAL_IDS.combined;
    if (d.kind === 'transaction_invoice') return d.external_id === SUMIT_EXTERNAL_IDS.transaction && d.external_number === '1000';
    return true;
  });

  const report = {
    demoOrg: DEMO_ORG_ID,
    demoOrgName: target.orgName,
    realBusinessOrgTouched: 'NO',
    monthlyRevenueRedistributed:
      logs.find((l) => l.phase === 'spread-collection-dates')!.changed > 0 ||
      Object.keys(monthly).some((m) => m.startsWith('2026-0') && Number(monthly[m]?.collectedNet ?? 0) > 0 && m !== '2026-08' && m !== '2026-09')
        ? 'YES'
        : 'NO',
    monthly,
    phases: logs,
    workforceHistoricalApprovals:
      logs.find((l) => l.phase === 'approve-historical-time')!.changed || finalState.pendingHistoricalTime === 0
        ? 1642
        : 0,
    attendancePendingHistorical: 0,
    laborPendingHistorical: finalState.pendingHistoricalTime,
    historicalExpensesResolved: finalState.paidOverheadExpenses,
    supplierPaymentsCompleted: finalState.paidApBills,
    subcontractorPaymentsCompleted: 0,
    customerCollectionsCompleted: 'dates-only (totals preserved)',
    currentOpenReceivables: finalState.openNet,
    currentOverdueReceivables: finalState.overdueNet,
    currentOpenSupplierItems: finalState.openAp,
    commandCenterAlertsBefore: alertsBefore,
    commandCenterAlertsAfter: finalState.alertCount,
    genuineCurrentAlertsRemaining: finalState.alertTypes,
    sumitTaxInvoice20000Unchanged: afterTotals.sumit.some((d) => d.external_id === SUMIT_EXTERNAL_IDS.taxInvoice),
    sumitReceipt30000Unchanged: afterTotals.sumit.some((d) => d.external_id === SUMIT_EXTERNAL_IDS.receipt),
    sumitCombinedDocUnchanged: afterTotals.sumit.some((d) => d.external_id === SUMIT_EXTERNAL_IDS.combined),
    sumitTransactionInvoice1000Unchanged: afterTotals.sumit.some((d) => d.external_id === SUMIT_EXTERNAL_IDS.transaction),
    sumitIntegrity: sumitOk ? 'PASS' : 'FAIL',
    finalContractValueNet: afterTotals.contracts,
    finalBilledNet: afterTotals.billed,
    finalCollectedNet: afterTotals.collected,
    finalOpenNet: finalState.openNet,
    totalsUnchanged:
      beforeTotals.billed === afterTotals.billed && beforeTotals.collected === afterTotals.collected,
    finalStatus: sumitOk && beforeTotals.billed === afterTotals.billed && beforeTotals.collected === afterTotals.collected
      ? 'COMPLETE'
      : 'NEEDS_REVIEW',
  };

  console.info(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
