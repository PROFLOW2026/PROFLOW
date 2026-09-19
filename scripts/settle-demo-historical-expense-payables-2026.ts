/**
 * Demo-org expense-side historical payable settlement (AP, expenses, payroll).
 * Does NOT touch receivables, billing, or customer payments.
 *
 * Usage:
 *   $env:NODE_OPTIONS="--require ./scripts/profile-shim.cjs"
 *   npx tsx scripts/settle-demo-historical-expense-payables-2026.ts
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

const DEMO_ORG_ID = 'b1460c82-36cd-429a-b30d-ea5644d58fe3';
const EXCLUDED_ORG_NAME = 'מתח ח.י הנדסת חשמל בע"מ';
const DEMO_USER_EMAIL = 'mthsystems@gmail.com';
const MARKER = 'PF-DEMO-SETTLE-EXP-2026';
/** Pay obligations strictly before this date (not on or after). */
const HISTORY_CUTOFF = '2026-09-19';

const EXPENSE_ALERT_TYPES = new Set([
  'vendor_bill_due',
  'vendor_bill_approaching',
  'expense_due_today',
  'expense_due_soon',
  'expense_overdue',
  'expense_pending_review',
  'expense_needs_allocation',
  'payroll_due_today',
  'payroll_due_soon',
  'payroll_overdue',
  'payroll_pending_review',
]);

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

function sanitizeRefPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9/_-]+/g, '-').slice(0, 80);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- script-only snapshot helper
async function snapshotExpenseSide(context: any) {
  const { getOrganizationApPayables } = await import('../src/modules/ap/index.ts');
  const { getActionableInbox } = await import('../src/modules/command-center/index.ts');
  const { getProjectFinancials } = await import('../src/modules/financials/application/get-project-financials.ts');
  const { projects } = await import('@drizzle/schema');
  const { eq, and, isNull } = await import('drizzle-orm');

  const ap = await getOrganizationApPayables(context);

  // Canonical AP only — outstanding = billTotal − paid − credits − retention (cash/gross basis).
  const openApBills = ap.bills
    .filter((b) => Number(b.outstanding) > 0)
    .sort((a, b) => {
      const ad = a.dueDate ?? '9999-12-31';
      const bd = b.dueDate ?? '9999-12-31';
      return ad.localeCompare(bd) || (a.reference ?? '').localeCompare(b.reference ?? '');
    });

  const overdueApBills = openApBills.filter((b) => b.dueDate != null && b.dueDate < HISTORY_CUTOFF);

  const openApItems = openApBills.map((b) => ({
    reference: b.reference,
    vendor: b.vendorName,
    dueDate: b.dueDate,
    billTotal: b.billTotal,
    paid: b.paid,
    credits: b.credited,
    retention: b.retentionHeldRemaining,
    outstanding: b.outstanding,
  }));

  const openItemsSumOutstanding = openApBills.reduce((s, b) => s + Number(b.outstanding), 0);

  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const sql = postgres(cs, { prepare: false, max: 1 });

  const unpaidExpenses = await sql`
    select id, description, expense_date::text, due_date::text, payment_status, net_amount::text
    from expenses
    where organization_id = ${DEMO_ORG_ID}::uuid and status = 'finalized' and archived_at is null
      and coalesce(payment_status, '') not in ('paid', 'not_applicable')
    order by coalesce(due_date, expense_date)
  `;

  const payrollRows = await sql`
    select id, year_month, due_date::text, expected_amount::text, payment_status, paid_at::text
    from employee_payroll_payments
    where organization_id = ${DEMO_ORG_ID}::uuid and voided_at is null
    order by year_month
  `;

  await sql.end();

  const inbox = await getActionableInbox(context);
  const expenseAlerts = inbox.items.filter((i) => EXPENSE_ALERT_TYPES.has(i.sourceType));

  const projectRows = await context.db
    .select({ id: projects.id, documentNumber: projects.documentNumber })
    .from(projects)
    .where(and(eq(projects.organizationId, DEMO_ORG_ID), eq(projects.status, 'active'), isNull(projects.archivedAt)));

  const profitability: Record<string, { direct: string; allocated: string; full: string }> = {};
  for (const p of projectRows) {
    const fin = await getProjectFinancials(context, p.id);
    const doc = p.documentNumber?.replace('PRJ-', '') ?? p.id.slice(0, 8);
    profitability[doc] = {
      direct: fin.cost.directActualCostToDate?.amount ?? fin.cost.actualCostToDate.amount,
      allocated: fin.cost.allocatedGeneralBusinessCost?.amount ?? '0',
      full: fin.cost.fullActualCostToDate?.amount ?? '0',
    };
  }

  const overdueApTotal = overdueApBills.reduce((s, b) => s + Number(b.outstanding), 0);

  return {
    ap: {
      total: ap.billed,
      paid: ap.paid,
      open: ap.outstanding,
      overdue: overdueApTotal.toFixed(2),
    },
    apReconciles: openItemsSumOutstanding.toFixed(2) === Number(ap.outstanding).toFixed(2),
    openApItems,
    openItemsSumOutstanding: openItemsSumOutstanding.toFixed(2),
    overdueApBills,
    openApBills,
    unpaidExpenses,
    payrollRows,
    expenseAlerts: expenseAlerts.map((i) => ({
      sourceType: i.sourceType,
      title: i.title,
      sourceId: i.sourceId,
    })),
    expenseAlertCount: expenseAlerts.length,
    profitability,
  };
}

async function main() {
  const target = await assertDemoOrg();
  const { withUserContext } = await import('../src/shared/db/client.ts');
  const { resolveOrgContext } = await import('../src/modules/tenancy/index.ts');

  const before = await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    return snapshotExpenseSide(context);
  });

  const counters = {
    apPaymentsAdded: 0,
    expensePaymentsAdded: 0,
    payrollPaymentsAdded: 0,
    apSkipped: 0,
    expenseSkipped: 0,
    payrollSkipped: 0,
    apErrors: [] as string[],
    expenseErrors: [] as string[],
    payrollErrors: [] as string[],
  };

  await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });

    const { recordVendorPayment, getBillPayablePosition } = await import('../src/modules/ap/index.ts');
    const { confirmExpensePaid } = await import('../src/modules/expenses/application/expense-payments.ts');
    const { confirmPayrollPaid } = await import('../src/modules/workforce/application/payroll-payments.ts');
    const { findExpenseById } = await import('../src/modules/expenses/data/expenses.repository.ts');
    const { resolveExpensePaymentObligation } = await import(
      '../src/modules/expenses/domain/resolve-expense-payment-obligation.ts'
    );
    const { businessDate, todayInTimeZone } = await import('../src/shared/dates');
    const { apBills, apPayments, employeePayrollPayments } = await import('@drizzle/schema');
    const { and, eq, isNull } = await import('drizzle-orm');

    const today = todayInTimeZone(context.organization.timezone);

    // --- AP bills (includes subcontractors via same AP lifecycle) ---
    for (const row of before.overdueApBills) {
      const payRef = `${MARKER}/AP/${sanitizeRefPart(row.reference ?? row.billId)}`;
      const [existingPay] = await context.db
        .select({ id: apPayments.id })
        .from(apPayments)
        .where(and(eq(apPayments.organizationId, DEMO_ORG_ID), eq(apPayments.reference, payRef)))
        .limit(1);
      if (existingPay) {
        counters.apSkipped += 1;
        continue;
      }

      const [bill] = await context.db
        .select({ id: apBills.id, vendorId: apBills.vendorId, currency: apBills.currency, dueDate: apBills.dueDate })
        .from(apBills)
        .where(and(eq(apBills.organizationId, DEMO_ORG_ID), eq(apBills.id, row.billId)))
        .limit(1);
      if (!bill) {
        counters.apSkipped += 1;
        continue;
      }

      const position = await getBillPayablePosition(context, bill.id);
      if (!position || Number(position.outstanding) <= 0) {
        counters.apSkipped += 1;
        continue;
      }

      const paymentDate = bill.dueDate ?? row.dueDate;
      if (!paymentDate || paymentDate >= HISTORY_CUTOFF) {
        counters.apSkipped += 1;
        continue;
      }

      try {
        await recordVendorPayment(context, {
          vendorId: bill.vendorId,
          amount: position.outstanding,
          currency: bill.currency,
          paymentDate,
          method: 'העברה בנקאית',
          reference: payRef,
          notes: `${MARKER}:historical-ap-settlement`,
          applications: [{ apBillId: bill.id, appliedAmount: position.outstanding }],
        });
        counters.apPaymentsAdded += 1;
      } catch (e) {
        counters.apErrors.push(`${row.reference}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // --- General / recurring expense payables ---
    for (const row of before.unpaidExpenses) {
      const effectiveDue = row.due_date ?? row.expense_date;
      if (!effectiveDue || effectiveDue >= HISTORY_CUTOFF) {
        counters.expenseSkipped += 1;
        continue;
      }

      const expense = await findExpenseById(context.db, DEMO_ORG_ID, row.id);
      if (!expense || expense.status !== 'finalized') {
        counters.expenseSkipped += 1;
        continue;
      }

      const obligationInput = {
        grossAmount: expense.grossAmount.amount,
        currency: expense.grossAmount.currency,
        expenseDate: businessDate(expense.expenseDate),
        installmentCount: expense.installmentCount,
        installmentStartDate: expense.installmentStartDate ? businessDate(expense.installmentStartDate) : null,
        installmentsPaidCount: expense.installmentsPaidCount ?? 0,
        paidGrossAmount: expense.paidGrossAmount,
        dueDate: expense.dueDate ? businessDate(expense.dueDate) : null,
        paymentStatus: expense.paymentStatus,
        paidAt: expense.paidAt,
      };
      const obligation = resolveExpensePaymentObligation(obligationInput, today);
      if (obligation.isFullyPaid || Number(obligation.payableAmount.amount) <= 0) {
        counters.expenseSkipped += 1;
        continue;
      }

      const paidAt = obligation.effectiveDueDate ?? businessDate(effectiveDue);
      if (paidAt >= HISTORY_CUTOFF) {
        counters.expenseSkipped += 1;
        continue;
      }

      try {
        await confirmExpensePaid(context, row.id, { paidAt });
        counters.expensePaymentsAdded += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('already marked paid')) counters.expenseSkipped += 1;
        else counters.expenseErrors.push(`${row.description?.slice(0, 40)}: ${msg}`);
      }
    }

    // --- Payroll obligations ---
    const unpaidPayroll = await context.db
      .select({
        id: employeePayrollPayments.id,
        yearMonth: employeePayrollPayments.yearMonth,
        dueDate: employeePayrollPayments.dueDate,
        paidAt: employeePayrollPayments.paidAt,
      })
      .from(employeePayrollPayments)
      .where(
        and(
          eq(employeePayrollPayments.organizationId, DEMO_ORG_ID),
          isNull(employeePayrollPayments.paidAt),
          isNull(employeePayrollPayments.voidedAt),
        ),
      );

    for (const row of unpaidPayroll) {
      if (!row.dueDate || row.dueDate >= HISTORY_CUTOFF) {
        counters.payrollSkipped += 1;
        continue;
      }
      try {
        await confirmPayrollPaid(context, row.id, { paidAt: businessDate(row.dueDate) });
        counters.payrollPaymentsAdded += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('already marked paid')) counters.payrollSkipped += 1;
        else counters.payrollErrors.push(`${row.yearMonth}: ${msg}`);
      }
    }
  });

  const after = await withUserContext(target.userId, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: target.userId,
      organizationId: DEMO_ORG_ID,
      locale: 'he-IL',
    });
    return snapshotExpenseSide(context);
  });

  const profitabilityUnchanged = Object.keys(before.profitability).every((doc) => {
    const b = before.profitability[doc];
    const a = after.profitability[doc];
    return b.direct === a.direct && b.allocated === a.allocated && b.full === a.full;
  });

  const oldestOpen = after.openApBills[0] ?? null;
  const remainingOverdue = after.overdueApBills;

  const classifyAlerts = (alerts: typeof after.expenseAlerts) => {
    const current: typeof alerts = [];
    const overdue: typeof alerts = [];
    const other: typeof alerts = [];
    for (const a of alerts) {
      if (a.sourceType.includes('overdue')) overdue.push(a);
      else if (a.sourceType.includes('due_soon') || a.sourceType.includes('due_today') || a.sourceType.includes('approaching'))
        current.push(a);
      else other.push(a);
    }
    return { current, overdue, other };
  };

  const afterAlertClass = classifyAlerts(after.expenseAlerts);

  console.info(
    JSON.stringify(
      {
        demoOrgOnly: 'YES',
        realBusinessOrgTouched: 'NO',
        marker: MARKER,
        historicalObligationsReviewed:
          before.overdueApBills.length + before.unpaidExpenses.length + before.payrollRows.filter((p) => !p.paid_at).length,
        historicalPaymentsAdded:
          counters.apPaymentsAdded + counters.expensePaymentsAdded + counters.payrollPaymentsAdded,
        supplierApPaymentsAdded: counters.apPaymentsAdded,
        expensePaymentsAdded: counters.expensePaymentsAdded,
        payrollPaymentsAdded: counters.payrollPaymentsAdded,
        notYetDueLeftOpen: counters.apSkipped + counters.expenseSkipped + counters.payrollSkipped,
        futureItemsModified: 'NO',
        apBefore: before.ap,
        apAfter: after.ap,
        apReconciles: after.apReconciles,
        openApItemsAfter: after.openApItems,
        openItemsSumOutstandingAfter: after.openItemsSumOutstanding,
        expenseAlertsBefore: before.expenseAlertCount,
        expenseAlertsAfter: after.expenseAlertCount,
        expenseAlertsBeforeList: before.expenseAlerts,
        expenseAlertsAfterList: after.expenseAlerts,
        alertClassificationAfter: afterAlertClass,
        remainingOverdueExpenseItems: [
          ...remainingOverdue.map((r) => ({
            kind: 'ap',
            reference: r.reference,
            dueDate: r.dueDate,
            outstanding: r.outstanding,
            reason: 'Still open after settlement attempt',
          })),
          ...after.unpaidExpenses
            .filter((e) => (e.due_date ?? e.expense_date) < HISTORY_CUTOFF)
            .map((e) => ({
              kind: 'expense',
              description: e.description,
              dueDate: e.due_date ?? e.expense_date,
              status: e.payment_status,
              reason: 'Unpaid expense past cutoff',
            })),
          ...after.payrollRows
            .filter((p) => !p.paid_at && p.due_date && p.due_date < HISTORY_CUTOFF)
            .map((p) => ({
              kind: 'payroll',
              yearMonth: p.year_month,
              dueDate: p.due_date,
              reason: 'Unpaid payroll past cutoff',
            })),
        ],
        oldestOpenPayable: oldestOpen
          ? {
              reference: oldestOpen.reference,
              vendor: oldestOpen.vendorName,
              dueDate: oldestOpen.dueDate,
              billTotal: oldestOpen.billTotal,
              outstanding: oldestOpen.outstanding,
            }
          : null,
        counters,
        projectCostsChangedByPayments: !profitabilityUnchanged,
        profitabilityBefore: before.profitability,
        profitabilityAfter: after.profitability,
        customerReceivablesModified: 'NO',
        customerCollectionsModified: 'NO',
        idempotent: 'YES — deterministic payment refs under PF-DEMO-SETTLE-EXP-2026',
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
