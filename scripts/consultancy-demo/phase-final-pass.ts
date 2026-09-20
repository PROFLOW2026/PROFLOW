import {
  CONSULTANCY_ORG_NAME,
  EXCLUDED_ORG_NAME,
  HISTORY_END,
  SEED_MARKER,
} from './constants.ts';
import type { RunPhase, SeedStats, SeedTarget } from './context.ts';

/** Pay / approve obligations strictly before demo "today" (HISTORY_END). */
export const SETTLEMENT_CUTOFF = '2026-09-19';
export const SETTLEMENT_MARKER = `${SEED_MARKER}:settle`;

const MONTHS_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
] as const;

export interface FinalPassReport {
  apPaymentsAdded: number;
  expensePaymentsAdded: number;
  payrollPaymentsAdded: number;
  apSkippedFuture: number;
  expenseSkippedFuture: number;
  payrollSkippedFuture: number;
  timeSubmitted: number;
  timeApproved: number;
  timeSkipped: number;
  pendingHoursAfter: number;
  activityDatesAdjusted: number;
}

/** Demo-only fast approve — per-timesheet canonical approve on 800+ rows exceeds seed timeouts. */
async function fastApproveHistoricalDemoTime(
  organizationId: string,
  userId: string,
  cutoff: string,
): Promise<{ approved: number; timesheetsClosed: number }> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const approvedRows = await sql<{ id: string }[]>`
      update time_entries
      set
        approval_status = 'approved',
        submitted_at = coalesce(submitted_at, now()),
        submitted_by_user_id = coalesce(submitted_by_user_id, ${userId}::uuid),
        decided_at = coalesce(decided_at, now()),
        decided_by_user_id = coalesce(decided_by_user_id, ${userId}::uuid)
      where organization_id = ${organizationId}::uuid
        and status = 'recorded'
        and work_date <= ${cutoff}::date
        and approval_status in ('draft', 'returned', 'submitted')
        and description like ${'%' + SEED_MARKER + '%'}
      returning id`;
    const closedSheets = await sql<{ id: string }[]>`
      update timesheets
      set
        status = 'approved',
        submitted_at = coalesce(submitted_at, now()),
        submitted_by_user_id = coalesce(submitted_by_user_id, ${userId}::uuid),
        decided_at = coalesce(decided_at, now()),
        decided_by_user_id = coalesce(decided_by_user_id, ${userId}::uuid),
        locked_at = coalesce(locked_at, now())
      where organization_id = ${organizationId}::uuid
        and period_end <= ${cutoff}::date
        and status in ('draft', 'submitted', 'returned')
      returning id`;
    return { approved: approvedRows.length, timesheetsClosed: closedSheets.length };
  } finally {
    await sql.end();
  }
}

function hashSlot(key: string, slots: number): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % slots;
}

function spreadBusinessDate(key: string, dayOffset = 0): string {
  const month = MONTHS_2026[hashSlot(key, MONTHS_2026.length)]!;
  const day = 5 + hashSlot(`${key}:d`, 20) + dayOffset;
  const clampedDay = Math.min(day, 28);
  return `${month}-${String(clampedDay).padStart(2, '0')}`;
}

function sanitizeRefPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9/_-]+/g, '-').slice(0, 80);
}

function isSeedScopedText(value: string | null | undefined): boolean {
  return (value ?? '').includes(SEED_MARKER);
}

export async function applyConsultancyFinalPass(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
): Promise<FinalPassReport> {
  const report: FinalPassReport = {
    apPaymentsAdded: 0,
    expensePaymentsAdded: 0,
    payrollPaymentsAdded: 0,
    apSkippedFuture: 0,
    expenseSkippedFuture: 0,
    payrollSkippedFuture: 0,
    timeSubmitted: 0,
    timeApproved: 0,
    timeSkipped: 0,
    pendingHoursAfter: 0,
    activityDatesAdjusted: 0,
  };

  void CONSULTANCY_ORG_NAME;
  void EXCLUDED_ORG_NAME;

  await runPhase('distribute activity Jan-Sep 2026', target.organizationId, target.userId, async (context) => {
    const {
      billingRecords,
      payments,
      apBills,
      meetingRecords,
      projectMilestones,
      tasks,
      changeRequests,
    } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');

    const markerLike = `%${SEED_MARKER}%`;
    let adjusted = 0;

    void billingRecords;
    void payments;
    void apBills;

    const meetingRows = await context.db
      .select({ id: meetingRecords.id, notes: meetingRecords.notes, scheduledAt: meetingRecords.scheduledAt })
      .from(meetingRecords)
      .where(and(eq(meetingRecords.organizationId, target.organizationId), like(meetingRecords.notes, markerLike)));

    for (const row of meetingRows) {
      const date = spreadBusinessDate(row.notes ?? row.id, 3);
      const nextAt = new Date(`${date}T${String(8 + hashSlot(row.id, 4)).padStart(2, '0')}:30:00.000Z`);
      if (row.scheduledAt.getTime() === nextAt.getTime()) continue;
      const updated = await context.db
        .update(meetingRecords)
        .set({ scheduledAt: nextAt })
        .where(and(eq(meetingRecords.id, row.id), eq(meetingRecords.organizationId, target.organizationId)))
        .returning({ id: meetingRecords.id });
      adjusted += updated.length;
    }

    const milestoneRows = await context.db
      .select({ id: projectMilestones.id, notes: projectMilestones.notes, targetDate: projectMilestones.targetDate })
      .from(projectMilestones)
      .where(
        and(eq(projectMilestones.organizationId, target.organizationId), like(projectMilestones.notes, markerLike)),
      );

    for (const row of milestoneRows) {
      const nextDate = spreadBusinessDate(row.notes ?? row.id, 4);
      if (nextDate === row.targetDate) continue;
      const updated = await context.db
        .update(projectMilestones)
        .set({ targetDate: nextDate })
        .where(
          and(
            eq(projectMilestones.id, row.id),
            eq(projectMilestones.organizationId, target.organizationId),
            sql`${projectMilestones.targetDate} is distinct from ${nextDate}`,
          ),
        )
        .returning({ id: projectMilestones.id });
      adjusted += updated.length;
    }

    const taskRows = await context.db
      .select({ id: tasks.id, description: tasks.description, dueDate: tasks.dueDate })
      .from(tasks)
      .where(and(eq(tasks.organizationId, target.organizationId), like(tasks.description, markerLike)));

    for (const row of taskRows) {
      const nextDate = spreadBusinessDate(row.description ?? row.id, 6);
      if (nextDate === row.dueDate) continue;
      const updated = await context.db
        .update(tasks)
        .set({ dueDate: nextDate })
        .where(
          and(
            eq(tasks.id, row.id),
            eq(tasks.organizationId, target.organizationId),
            sql`${tasks.dueDate} is distinct from ${nextDate}`,
          ),
        )
        .returning({ id: tasks.id });
      adjusted += updated.length;
    }

    const changeRows = await context.db
      .select({ id: changeRequests.id, notes: changeRequests.notes, requestedDate: changeRequests.requestedDate })
      .from(changeRequests)
      .where(and(eq(changeRequests.organizationId, target.organizationId), like(changeRequests.notes, markerLike)));

    for (const row of changeRows) {
      if (!row.requestedDate) continue;
      const nextDate = spreadBusinessDate(row.notes ?? row.id, 7);
      if (nextDate === row.requestedDate) continue;
      const updated = await context.db
        .update(changeRequests)
        .set({ requestedDate: nextDate })
        .where(
          and(
            eq(changeRequests.id, row.id),
            eq(changeRequests.organizationId, target.organizationId),
            sql`${changeRequests.requestedDate} is distinct from ${nextDate}`,
          ),
        )
        .returning({ id: changeRequests.id });
      adjusted += updated.length;
    }

    report.activityDatesAdjusted = adjusted;
    stats.notes.push(`Activity dates redistributed across Jan–Sep 2026: ${adjusted} rows.`);
  });

  await runPhase('settle past-due payables', target.organizationId, target.userId, async (context) => {
    const { getOrganizationApPayables, getBillPayablePosition, recordVendorPayment } = await import(
      '../../src/modules/ap/index.ts'
    );
    const { confirmExpensePaid } = await import('../../src/modules/expenses/application/expense-payments.ts');
    const { confirmPayrollPaid } = await import('../../src/modules/workforce/application/payroll-payments.ts');
    const { findExpenseById } = await import('../../src/modules/expenses/data/expenses.repository.ts');
    const { resolveExpensePaymentObligation } = await import(
      '../../src/modules/expenses/domain/resolve-expense-payment-obligation.ts'
    );
    const { businessDate, todayInTimeZone } = await import('../../src/shared/dates/index.ts');
    const { apBills, apPayments, employeePayrollPayments, expenses } = await import('@drizzle/schema');
    const { and, eq, isNull, like, or, sql } = await import('drizzle-orm');

    const today = todayInTimeZone(context.organization.timezone);
    const markerLike = `%${SEED_MARKER}%`;

    const apSummary = await getOrganizationApPayables(context);
    const openApBills = apSummary.bills.filter(
      (bill) => Number(bill.outstanding) > 0 && isSeedScopedText(bill.reference),
    );

    for (const row of openApBills) {
      const effectiveDue = row.dueDate;
      if (!effectiveDue || effectiveDue >= HISTORY_END) {
        report.apSkippedFuture += 1;
        continue;
      }

      const payRef = `${SETTLEMENT_MARKER}/AP/${sanitizeRefPart(row.reference ?? row.billId)}`;
      const [existingPay] = await context.db
        .select({ id: apPayments.id })
        .from(apPayments)
        .where(and(eq(apPayments.organizationId, target.organizationId), eq(apPayments.reference, payRef)))
        .limit(1);
      if (existingPay) continue;

      const [bill] = await context.db
        .select({
          id: apBills.id,
          vendorId: apBills.vendorId,
          currency: apBills.currency,
          dueDate: apBills.dueDate,
          billDate: apBills.billDate,
        })
        .from(apBills)
        .where(and(eq(apBills.organizationId, target.organizationId), eq(apBills.id, row.billId)))
        .limit(1);
      if (!bill) continue;

      const position = await getBillPayablePosition(context, bill.id);
      if (!position || Number(position.outstanding) <= 0) continue;

      const paymentDate = bill.dueDate ?? bill.billDate ?? effectiveDue;
      if (paymentDate >= HISTORY_END) {
        report.apSkippedFuture += 1;
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
          notes: `${SETTLEMENT_MARKER}:historical-ap`,
          applications: [{ apBillId: bill.id, appliedAmount: position.outstanding }],
        });
        report.apPaymentsAdded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.notes.push(`AP settle skip ${row.reference ?? row.billId}: ${message}`);
      }
    }

    const unpaidExpenses = await context.db
      .select({
        id: expenses.id,
        description: expenses.description,
        expenseDate: expenses.expenseDate,
        dueDate: expenses.dueDate,
        paymentStatus: expenses.paymentStatus,
        notes: expenses.notes,
      })
      .from(expenses)
      .where(
        and(
          eq(expenses.organizationId, target.organizationId),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
          or(like(expenses.notes, markerLike), like(expenses.description, markerLike)),
          sql`coalesce(${expenses.paymentStatus}, '') not in ('paid', 'not_applicable')`,
        ),
      );

    for (const row of unpaidExpenses) {
      const effectiveDue = row.dueDate ?? row.expenseDate;
      if (!effectiveDue || effectiveDue >= HISTORY_END) {
        report.expenseSkippedFuture += 1;
        continue;
      }

      const expense = await findExpenseById(context.db, target.organizationId, row.id);
      if (!expense || expense.status !== 'finalized') continue;

      const obligation = resolveExpensePaymentObligation(
        {
          grossAmount: expense.grossAmount.amount,
          currency: expense.grossAmount.currency,
          expenseDate: businessDate(expense.expenseDate),
          installmentCount: expense.installmentCount,
          installmentStartDate: expense.installmentStartDate
            ? businessDate(expense.installmentStartDate)
            : null,
          installmentsPaidCount: expense.installmentsPaidCount ?? 0,
          paidGrossAmount: expense.paidGrossAmount,
          dueDate: expense.dueDate ? businessDate(expense.dueDate) : null,
          paymentStatus: expense.paymentStatus,
          paidAt: expense.paidAt ? businessDate(expense.paidAt) : null,
        },
        today,
      );
      if (obligation.isFullyPaid || Number(obligation.payableAmount.amount) <= 0) continue;

      const paidAt = obligation.effectiveDueDate ?? businessDate(effectiveDue);
      if (paidAt >= HISTORY_END) {
        report.expenseSkippedFuture += 1;
        continue;
      }

      try {
        await confirmExpensePaid(context, row.id, { paidAt });
        report.expensePaymentsAdded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already marked paid')) {
          stats.notes.push(`Expense settle skip ${row.id}: ${message}`);
        }
      }
    }

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
          eq(employeePayrollPayments.organizationId, target.organizationId),
          isNull(employeePayrollPayments.paidAt),
          isNull(employeePayrollPayments.voidedAt),
        ),
      );

    for (const row of unpaidPayroll) {
      if (!row.dueDate || row.dueDate >= HISTORY_END) {
        report.payrollSkippedFuture += 1;
        continue;
      }
      try {
        await confirmPayrollPaid(context, row.id, { paidAt: businessDate(row.dueDate) });
        report.payrollPaymentsAdded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes('already marked paid')) {
          stats.notes.push(`Payroll settle skip ${row.yearMonth}: ${message}`);
        }
      }
    }

    stats.notes.push(
      `Settled past-due: AP ${report.apPaymentsAdded}, expenses ${report.expensePaymentsAdded}, payroll ${report.payrollPaymentsAdded}; future left open.`,
    );
  });

  await runPhase('approve historical workforce time', target.organizationId, target.userId, async (context) => {
    const { sumTimeLaborPeriodReconciliation } = await import(
      '../../src/modules/workforce/data/time-entries.repository.ts'
    );

    const outcome = await fastApproveHistoricalDemoTime(
      target.organizationId,
      target.userId,
      SETTLEMENT_CUTOFF,
    );
    report.timeSubmitted = outcome.approved;
    report.timeApproved = outcome.approved;

    const monthStart = `${HISTORY_END.slice(0, 7)}-01`;
    const monthEnd = `${HISTORY_END.slice(0, 7)}-30`;
    const reconciliation = await sumTimeLaborPeriodReconciliation(
      context.db,
      target.organizationId,
      monthStart,
      monthEnd,
    );
    report.pendingHoursAfter = reconciliation.pendingHours;

    stats.notes.push(
      `Workforce cleanup: fast-approved ${outcome.approved} entries, ${outcome.timesheetsClosed} timesheets; Sep pending hours ${report.pendingHoursAfter}.`,
    );
  });

  return report;
}
