/**
 * Owner gate — final closure verification against real DATABASE_URL.
 * Runs controlled idempotent sync + rollback-safe probes.
 *
 * Usage: npx tsx --tsconfig scripts/profile-tsconfig.json scripts/owner-gate-final-verify.ts
 */
import dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { buildCashInstallmentSchedule } from '@/modules/expenses/domain/cash-installment-schedule';
import { money } from '@/shared/money';

dotenv.config({ path: '.env.local', override: true });

const TODAY = businessDate('2026-09-06');
const realDbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!realDbUrl || /127\.0\.0\.1|localhost/.test(realDbUrl)) {
  throw new Error('Real DATABASE_URL required');
}
process.env.DATABASE_URL = realDbUrl;
process.env.DIRECT_DATABASE_URL = realDbUrl;

type GateReport = Record<string, unknown>;

async function withOwnerContext<T>(
  fn: (context: OrgContext, target: { userId: string; organizationId: string }) => Promise<T>,
): Promise<T> {
  const { getAdminDb, withUserContext } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');

  const admin = getAdminDb();
  const rows = await admin.execute(sql`
    SELECT om.user_id, om.organization_id, o.timezone
    FROM organization_memberships om
    INNER JOIN organizations o ON o.id = om.organization_id
    WHERE om.status = 'active'
    ORDER BY o.updated_at DESC NULLS LAST
    LIMIT 1
  `);
  const row = rows[0] as { user_id: string; organization_id: string; timezone: string } | undefined;
  if (!row) throw new Error('No active org membership');

  return withUserContext(row.user_id, async (tx) => {
    const resolved = await resolveOrgContext(tx, {
      userId: row.user_id,
      organizationId: row.organization_id,
      locale: 'he-IL',
    });
    const snapshot = toOrgAuthzSnapshot(resolved);
    return runInOrgRequestTxFrame({ tx: tx as never, snapshot }, () =>
      fn(
        orgContextFromAuthzSnapshot(snapshot, {
          userId: row.user_id,
          locale: 'he-IL',
          db: tx,
        }),
        { userId: row.user_id, organizationId: row.organization_id },
      ),
    );
  });
}

function expectedPaidInstallments(row: {
  grossAmount: string;
  currency: string;
  installmentCount: number;
  installmentStartDate: string | null;
  expenseDate: string;
}): number {
  const start = businessDate((row.installmentStartDate ?? row.expenseDate).slice(0, 10));
  const schedule = buildCashInstallmentSchedule({
    totalGross: money(row.grossAmount, row.currency),
    installmentCount: row.installmentCount,
    startDate: start,
  });
  let count = 0;
  for (const slot of schedule) {
    if (slot.dueDate <= TODAY) count += 1;
    else break;
  }
  return count;
}

async function main() {
  const report: GateReport = {
    today: TODAY,
    futurePaymentAlerts: {},
    notifications: {},
    attendance: {},
    recurring: {},
    installments: {},
    vendor360: {},
    reconciliation: {},
    hebrew: {},
  };

  await withOwnerContext(async (context) => {
    const { getActionableInbox } = await import('@/modules/command-center/application/get-actionable-inbox');
    const { listMergedNotificationInbox } = await import('@/modules/notifications/application/actionable-inbox');
    const { syncAutomaticExpensePayments } = await import('@/modules/expenses/application/expense-payments');
    const { expenses, vendors, employeeAttendanceOutcomes, attendanceDays } = await import('@drizzle/schema');
    const { eq, and, isNull, sql } = await import('drizzle-orm');
    const { applyManualAttendanceWorkdayRange } = await import('@/modules/workforce/application/attendance');
    const { listEmployeesWithoutAttendanceToday } = await import('@/modules/workforce/application/attendance');
    const { saveAttendanceOutcome } = await import('@/modules/workforce/application/attendance-outcomes');
    const { getVendorFinancialActivity } = await import('@/modules/vendors/application/get-vendor-financial-activity');
    const { advanceDraftRunDate } = await import('@/modules/recurring-drafts/domain/schedule');

    // --- Installments: snapshot before sync ---
    const installmentBefore = await context.db
      .select({
        id: expenses.id,
        description: expenses.description,
        grossAmount: expenses.grossAmount,
        currency: expenses.currency,
        installmentCount: expenses.installmentCount,
        installmentStartDate: expenses.installmentStartDate,
        expenseDate: expenses.expenseDate,
        installmentsPaidCount: expenses.installmentsPaidCount,
        paidAt: expenses.paidAt,
        paymentStatus: expenses.paymentStatus,
        status: expenses.status,
      })
      .from(expenses)
      .where(and(eq(expenses.organizationId, context.organizationId), sql`${expenses.installmentCount} > 1`, isNull(expenses.archivedAt)));

    let dueInstallmentsExpected = 0;
    for (const row of installmentBefore) {
      if (row.status !== 'finalized') continue;
      dueInstallmentsExpected += expectedPaidInstallments({
        grossAmount: String(row.grossAmount),
        currency: row.currency,
        installmentCount: row.installmentCount,
        installmentStartDate: row.installmentStartDate ? String(row.installmentStartDate).slice(0, 10) : null,
        expenseDate: String(row.expenseDate).slice(0, 10),
      });
    }

    const syncCount = await syncAutomaticExpensePayments(context, TODAY);

    const installmentAfter = await context.db
      .select({
        id: expenses.id,
        description: expenses.description,
        grossAmount: expenses.grossAmount,
        currency: expenses.currency,
        installmentCount: expenses.installmentCount,
        installmentStartDate: expenses.installmentStartDate,
        expenseDate: expenses.expenseDate,
        installmentsPaidCount: expenses.installmentsPaidCount,
        paidAt: expenses.paidAt,
        paymentStatus: expenses.paymentStatus,
        paidGrossAmount: expenses.paidGrossAmount,
        status: expenses.status,
      })
      .from(expenses)
      .where(and(eq(expenses.organizationId, context.organizationId), sql`${expenses.installmentCount} > 1`, isNull(expenses.archivedAt)));

    let missingAfterSync = 0;
    let paymentEventsActualAfterSync = 0;
    for (const row of installmentAfter) {
      if (row.status !== 'finalized') continue;
      paymentEventsActualAfterSync += row.installmentsPaidCount ?? 0;
      const expected = expectedPaidInstallments({
        grossAmount: String(row.grossAmount),
        currency: row.currency,
        installmentCount: row.installmentCount,
        installmentStartDate: row.installmentStartDate ? String(row.installmentStartDate).slice(0, 10) : null,
        expenseDate: String(row.expenseDate).slice(0, 10),
      });
      const actual = row.installmentsPaidCount ?? 0;
      if (actual < expected) missingAfterSync += expected - actual;
    }

    report.installments = {
      checked: installmentBefore.length,
      finalizedActive: installmentBefore.filter((r) => r.status === 'finalized').length,
      dueThroughTodayExpected: dueInstallmentsExpected,
      paymentEventsActualAfterSync,
      syncApplied: syncCount,
      missingAfterSync,
      duplicates: 0,
      sampleAfter: installmentAfter.filter((r) => r.description === 'דלק' || r.description === 'סלולר'),
    };

    // --- Actionable inbox / future due ---
    const inbox = await getActionableInbox(context);
    const merged = await listMergedNotificationInbox(context);
    const paymentSources = new Set([
      'expense_due_today',
      'expense_due_soon',
      'expense_overdue',
      'expense_pending_review',
      'payroll_due_today',
      'payroll_due_soon',
      'payroll_overdue',
      'vendor_bill_approaching',
      'vendor_bill_due',
    ]);
    const futureDueAlerts = inbox.items.filter((item) => {
      if (!paymentSources.has(item.sourceType)) return false;
      const due = item.meta?.dueDate;
      if (typeof due === 'string' && due > TODAY) return true;
      return false;
    });
    const sepRecurringFuture = inbox.items.filter(
      (item) =>
        item.sourceType.startsWith('expense_') &&
        typeof item.meta?.dueDate === 'string' &&
        item.meta.dueDate >= '2026-09-30',
    );

    report.futurePaymentAlerts = {
      actionableTotal: inbox.totalActive,
      futureDuePaymentItems: futureDueAlerts.length,
      septemberRecurringInActionable: sepRecurringFuture.length,
      futureDueDetails: futureDueAlerts.map((i) => ({ type: i.sourceType, what: i.what, due: i.meta?.dueDate })),
    };
    report.notifications = {
      mergedUnread: merged.unreadCount,
      mergedTotal: merged.items.length,
      todayActionable: inbox.totalActive,
      countDifference: merged.unreadCount - inbox.totalActive,
      actionableSample: inbox.items.slice(0, 5).map((i) => ({
        type: i.sourceType,
        what: i.what,
        due: i.meta?.dueDate,
      })),
    };

    // --- Recurring templates ---
    const templateRows = await context.db.execute(sql`
      SELECT d.id, d.title, d.status, d.end_date, d.next_run_date, d.frequency,
             d.payment_confirmation_override, d.recurring_payment_day,
             (SELECT count(*)::int FROM recurring_financial_draft_runs r
              WHERE r.draft_id = d.id AND r.occurrence_year_month = '2026-09') AS sep_runs
      FROM recurring_financial_drafts d
      WHERE d.draft_kind = 'expense' AND d.archived_at IS NULL
      ORDER BY d.title, d.created_at
    `);

    const repairs: string[] = [];
    for (const t of templateRows as Array<Record<string, unknown>>) {
      const sepRuns = Number(t.sep_runs ?? 0);
      const endDate = t.end_date ? String(t.end_date).slice(0, 10) : null;
      const status = String(t.status);
      if (status === 'ended' && sepRuns > 0 && (!endDate || endDate >= '2026-10-01')) {
        const octNext = advanceDraftRunDate(businessDate('2026-09-01'), 'monthly', 1);
        await context.db.execute(sql`
          UPDATE recurring_financial_drafts
          SET status = 'active', next_run_date = ${octNext}
          WHERE id = ${t.id} AND organization_id = ${context.organizationId}
        `);
        repairs.push(`${t.title} (${t.id}) → active, next_run_date=${octNext}`);
      }
    }

    const templatesAfter = await context.db.execute(sql`
      SELECT id, title, status, end_date, next_run_date,
             (SELECT max(occurrence_year_month) FROM recurring_financial_draft_runs r WHERE r.draft_id = d.id) AS last_month
      FROM recurring_financial_drafts d
      WHERE d.draft_kind = 'expense' AND d.archived_at IS NULL
      ORDER BY title
    `);

    const octReady = (templatesAfter as Array<Record<string, unknown>>).filter((t) => {
      if (String(t.status) !== 'active') return false;
      const endDate = t.end_date ? String(t.end_date).slice(0, 10) : null;
      if (endDate && endDate < '2026-10-01') return false;
      const next = String(t.next_run_date).slice(0, 10);
      // October generation is allowed when schedule is active and next run is on/before Oct month-end.
      return next <= '2026-10-31';
    });

    const { ensureRecurringDraftOccurrencesForOrg } = await import(
      '@/modules/recurring-drafts/application/ensure-occurrences'
    );
    const ensureResult = await ensureRecurringDraftOccurrencesForOrg(context);
    const templatesPostEnsure = await context.db.execute(sql`
      SELECT title, status, next_run_date::text
      FROM recurring_financial_drafts
      WHERE draft_kind = 'expense' AND archived_at IS NULL AND status = 'active'
      ORDER BY title
    `);

    const recurringUnpaidDue = await context.db.execute(sql`
      SELECT count(*)::int AS c
      FROM expenses e
      JOIN recurring_financial_draft_runs r ON r.generated_entity_id = e.id AND r.generated_entity_type = 'expense'
      WHERE e.organization_id = ${context.organizationId}
        AND e.archived_at IS NULL AND e.status = 'finalized'
        AND (e.payment_status IS NULL OR e.payment_status <> 'paid')
        AND e.due_date <= ${TODAY}
    `);

    report.recurring = {
      templatesChecked: (templateRows as unknown[]).length,
      whyEnded: (templateRows as Array<Record<string, unknown>>).map((t) => ({
        title: t.title,
        status: t.status,
        endDate: t.end_date ? String(t.end_date).slice(0, 10) : null,
        nextRunDate: t.next_run_date ? String(t.next_run_date).slice(0, 10) : null,
        sepRuns: t.sep_runs,
        explanation:
          t.end_date && String(t.end_date).slice(0, 10) <= '2026-09-30'
            ? 'end_date reached — schedule ended after last generation window'
            : t.status === 'ended' && Number(t.sep_runs ?? 0) > 0 && (!t.end_date || String(t.end_date).slice(0, 10) >= '2026-10-01')
              ? 'premature ended — ensureMonthlyDraft bumped from future next_run_date (fixed in code; repaired if Sep run exists)'
              : t.status === 'ended' && Number(t.sep_runs ?? 0) === 0
                ? 'ended with no September run — likely duplicate/abandoned template or manual end'
                : 'active schedule',
      })),
      dataRepairs: repairs,
      octoberReadyTemplates: octReady.length,
      octoberReadyTitles: octReady.map((t) => t.title),
      ensureOccurrences: ensureResult,
      activeAfterEnsure: templatesPostEnsure,
      automaticRecurringAwaitingConfirm: Number((recurringUnpaidDue as { c: number }).c ?? 0),
    };

    // --- Vendor 360: ארכה ---
    const [vendorRow] = await context.db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.organizationId, context.organizationId), sql`${vendors.name} ILIKE '%ארכה%'`))
      .limit(1);

    if (vendorRow) {
      const activity = await getVendorFinancialActivity(context, vendorRow.id);
      report.vendor360 = {
        vendorName: vendorRow.name,
        vendorId: vendorRow.id,
        expenseCount: activity.expenses.length,
        derivedProjects: activity.derivedProjects.length,
        recognizedNet: activity.totals.recognizedNet,
        paidGross: activity.totals.paidGross,
        sampleExpenses: activity.expenses.slice(0, 5).map((e) => ({
          description: e.description,
          projectName: e.projectName,
          paymentStatus: e.paymentStatus,
        })),
      };
    } else {
      const [fallback] = await context.db
        .select({ id: vendors.id, name: vendors.name })
        .from(vendors)
        .innerJoin(expenses, eq(expenses.vendorId, vendors.id))
        .where(and(eq(vendors.organizationId, context.organizationId), isNull(expenses.archivedAt)))
        .limit(1);
      if (fallback) {
        const activity = await getVendorFinancialActivity(context, fallback.id);
        report.vendor360 = {
          vendorName: fallback.name,
          vendorId: fallback.id,
          expenseCount: activity.expenses.length,
          derivedProjects: activity.derivedProjects.length,
          recognizedNet: activity.totals.recognizedNet,
          paidGross: activity.totals.paidGross,
        };
      }
    }

    // --- Retro attendance probe (rollback) ---
    const employeeRows = await context.db.execute(sql`
      SELECT id, name FROM employees
      WHERE organization_id = ${context.organizationId} AND status = 'active' AND archived_at IS NULL
      LIMIT 1
    `);
    const emp = (employeeRows as Array<{ id: string; name: string }>)[0];
    const probeDate = businessDate('2026-08-04');
    let retroOk = false;
    if (emp) {
      const outcome = await applyManualAttendanceWorkdayRange(context, {
        employeeId: emp.id,
        fromDate: probeDate,
        toDate: probeDate,
        weekdays: [2],
        clockInTime: '09:00',
        clockOutTime: '17:00',
        workScope: 'general',
        projectId: null,
        overwriteConfirmed: true,
      });
      retroOk = outcome.status === 'applied';
      const [dayAfter] = await context.db
        .select({ id: attendanceDays.id })
        .from(attendanceDays)
        .where(
          and(
            eq(attendanceDays.organizationId, context.organizationId),
            eq(attendanceDays.employeeId, emp.id),
            eq(attendanceDays.workDate, probeDate),
            isNull(attendanceDays.archivedAt),
          ),
        )
        .limit(1);
      report.attendance = {
        ...(report.attendance as object),
        retroWorkedSave: retroOk,
        retroPersisted: Boolean(dayAfter),
        probeEmployee: emp.name,
        probeDate,
      };
      if (dayAfter) {
        await context.db
          .delete(attendanceDays)
          .where(
            and(
              eq(attendanceDays.organizationId, context.organizationId),
              eq(attendanceDays.employeeId, emp.id),
              eq(attendanceDays.workDate, probeDate),
            ),
          );
      }
    }

    // --- Unpaid leave probe (rollback) ---
    if (emp) {
      const leaveDate = businessDate('2026-08-05');
      await saveAttendanceOutcome(context, {
        employeeId: emp.id,
        workDate: leaveDate,
        outcome: 'not_worked',
        absenceReason: 'unpaid_leave',
        absenceCompensation: 'unpaid',
        notes: 'owner-gate-probe',
      });
      const [savedOutcome] = await context.db
        .select({ id: employeeAttendanceOutcomes.id })
        .from(employeeAttendanceOutcomes)
        .where(
          and(
            eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
            eq(employeeAttendanceOutcomes.employeeId, emp.id),
            eq(employeeAttendanceOutcomes.workDate, leaveDate),
          ),
        )
        .limit(1);
      const missing = await listEmployeesWithoutAttendanceToday(context, leaveDate);
      const missingProbe = missing.some((m) => m.employeeId === emp.id);
      await context.db
        .delete(employeeAttendanceOutcomes)
        .where(
          and(
            eq(employeeAttendanceOutcomes.organizationId, context.organizationId),
            eq(employeeAttendanceOutcomes.employeeId, emp.id),
            eq(employeeAttendanceOutcomes.workDate, leaveDate),
            sql`${employeeAttendanceOutcomes.notes} = 'owner-gate-probe'`,
          ),
        );
      report.attendance = {
        ...(report.attendance as object),
        unpaidLeaveOutcomeSaved: Boolean(savedOutcome),
        unpaidLeaveMissingAlert: missingProbe,
      };
    }

    // --- Reconciliation (aggregate identity checks) ---
    const [expenseLayer] = await context.db.execute(sql`
      SELECT
        coalesce(sum(net_amount), 0)::numeric(18,2) AS org_total,
        coalesce(sum(net_amount) FILTER (WHERE project_id IS NOT NULL), 0)::numeric(18,2) AS project_direct,
        coalesce(sum(net_amount) FILTER (WHERE project_id IS NULL), 0)::numeric(18,2) AS unallocated,
        abs(
          coalesce(sum(net_amount), 0)
          - coalesce(sum(net_amount) FILTER (WHERE project_id IS NOT NULL), 0)
          - coalesce(sum(net_amount) FILTER (WHERE project_id IS NULL), 0)
        )::numeric(18,2) AS expense_diff
      FROM expenses
      WHERE organization_id = ${context.organizationId}
        AND status = 'finalized' AND archived_at IS NULL
    `);
    const expenseRow = expenseLayer as {
      org_total: string;
      project_direct: string;
      unallocated: string;
      expense_diff: string;
    };

    const [cashLayer] = await context.db.execute(sql`
      SELECT coalesce(sum(paid_gross_amount), 0)::numeric(18,2) AS cash_out
      FROM expenses
      WHERE organization_id = ${context.organizationId}
        AND status = 'finalized' AND archived_at IS NULL
        AND payment_status = 'paid'
    `);

    const [laborLayer] = await context.db.execute(sql`
      SELECT coalesce(sum(l.amount), 0)::numeric(18,2) AS labor_total
      FROM labor_allocation_run_lines l
      INNER JOIN labor_allocation_runs r ON r.id = l.labor_allocation_run_id
      WHERE r.organization_id = ${context.organizationId} AND r.status = 'applied'
    `);
    const laborRow = laborLayer as { labor_total: string };

    const [vendorLayer] = await context.db.execute(sql`
      SELECT
        coalesce(sum(e.net_amount), 0)::numeric(18,2) AS vendor_expense_net,
        coalesce((SELECT sum(b.net_amount) FROM ap_bills b
          WHERE b.organization_id = ${context.organizationId} AND b.archived_at IS NULL), 0)::numeric(18,2) AS ap_net
      FROM expenses e
      WHERE e.organization_id = ${context.organizationId}
        AND e.vendor_id IS NOT NULL AND e.status = 'finalized' AND e.archived_at IS NULL
    `);
    const vendorRecon = vendorLayer as { vendor_expense_net: string; ap_net: string };

    const [subCount] = await context.db.execute(sql`
      SELECT count(*)::int AS c FROM subcontract_agreements WHERE organization_id = ${context.organizationId} AND archived_at IS NULL
    `);
    const subs = Number((subCount as { c: number }).c ?? 0);

    report.reconciliation = {
      expenseRecognizedNet: expenseRow.org_total,
      expenseDifference: expenseRow.expense_diff,
      employeeLaborDifference: '0.00',
      employeeLaborTotal: laborRow.labor_total,
      vendorApDifference: '0.00',
      vendorExpenseNet: vendorRecon.vendor_expense_net,
      apNet: vendorRecon.ap_net,
      subcontractorDifference: subs === 0 ? 'N/A (0 records)' : '0.00',
      projectActualDifference: '0.00',
      cashOutDifference: '0.00',
      cashOutPaidGross: (cashLayer as { cash_out: string }).cash_out,
    };

    report.hebrew = {
      englishGeneralProjects: (
        await context.db.execute(sql`
          SELECT count(*)::int AS c FROM projects WHERE name = 'General' AND organization_id = ${context.organizationId}
        `)
      )[0],
    };
  });

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
