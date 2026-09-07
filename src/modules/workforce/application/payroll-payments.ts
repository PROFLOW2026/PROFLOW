import { and, eq, isNull, sql } from 'drizzle-orm';
import { employeePayrollPayments, employees } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, type BusinessDate } from '@/shared/dates';
import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { fromNumericString, isPositiveMoney } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getOrgFinancialPolicies } from '@/modules/tenancy/application/org-financial-policies';
import { salaryDueDateForPeriod } from '@/modules/tenancy/domain/org-financial-policies';

const PAYROLL_CONFIRMED = AUDIT_ACTIONS.PAYROLL_PAYMENT_CONFIRMED;
const PAYROLL_VOIDED = AUDIT_ACTIONS.PAYROLL_PAYMENT_CONFIRMATION_VOIDED;

export type PayrollSyncFromLabor = 'upsert' | 'updateExistingOnly';

/**
 * Sync payroll expected amount after labor recompute.
 * - upsert: create row when missing (compensation/bootstrap paths)
 * - updateExistingOnly: attendance path — never INSERT; paid rows untouched
 */
export async function syncPayrollExpectedFromLaborRecompute(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly yearMonth: string;
    readonly expectedAmount: string;
    readonly currency: string;
    readonly mode: PayrollSyncFromLabor;
  },
): Promise<'inserted' | 'updated' | 'closed_zero' | 'skipped_paid' | 'skipped_no_row'> {
  if (input.mode === 'upsert') {
    await upsertPayrollPaymentExpected(context, {
      employeeId: input.employeeId,
      yearMonth: input.yearMonth,
      expectedAmount: input.expectedAmount,
      currency: input.currency,
    });
    return 'updated';
  }

  const policies = await getOrgFinancialPolicies(context);
  const dueDate = salaryDueDateForPeriod(input.yearMonth, policies.salaryPaymentDay);
  const today = todayInTimeZone(context.organization.timezone);
  const expectedMoney = fromNumericString(input.expectedAmount, input.currency);
  const zeroOrNegative = !expectedMoney || !isPositiveMoney(expectedMoney);

  const [existing] = await context.db
    .select({
      id: employeePayrollPayments.id,
      paidAt: employeePayrollPayments.paidAt,
      paymentConfirmationSource: employeePayrollPayments.paymentConfirmationSource,
    })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.employeeId, input.employeeId),
        eq(employeePayrollPayments.yearMonth, input.yearMonth),
        isNull(employeePayrollPayments.voidedAt),
      ),
    )
    .limit(1);

  if (!existing) return 'skipped_no_row';
  if (existing.paidAt) return 'skipped_paid';

  if (zeroOrNegative) {
    await context.db
      .update(employeePayrollPayments)
      .set({
        expectedAmount: input.expectedAmount,
        currency: input.currency,
        dueDate,
        paymentStatus: 'paid',
        paidAt: today,
        paidAmount: '0',
        paymentConfirmationSource: 'automatic_policy',
      })
      .where(eq(employeePayrollPayments.id, existing.id));
    return 'closed_zero';
  }

  let status: 'upcoming' | 'due' | 'overdue' = 'upcoming';
  if (dueDate < today) status = 'overdue';
  else if (dueDate === today) status = 'due';

  await context.db
    .update(employeePayrollPayments)
    .set({
      expectedAmount: input.expectedAmount,
      currency: input.currency,
      dueDate,
      paymentStatus: status,
    })
    .where(eq(employeePayrollPayments.id, existing.id));
  return 'updated';
}

export async function upsertPayrollPaymentExpected(
  context: OrgContext,
  input: {
    readonly employeeId: string;
    readonly yearMonth: string;
    readonly expectedAmount: string;
    readonly currency: string;
  },
): Promise<void> {
  const policies = await getOrgFinancialPolicies(context);
  const dueDate = salaryDueDateForPeriod(input.yearMonth, policies.salaryPaymentDay);
  const today = todayInTimeZone(context.organization.timezone);
  const expectedMoney = fromNumericString(input.expectedAmount, input.currency);
  const zeroOrNegative = !expectedMoney || !isPositiveMoney(expectedMoney);

  const [existing] = await context.db
    .select({ id: employeePayrollPayments.id, paidAt: employeePayrollPayments.paidAt })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.employeeId, input.employeeId),
        eq(employeePayrollPayments.yearMonth, input.yearMonth),
        isNull(employeePayrollPayments.voidedAt),
      ),
    )
    .limit(1);

  if (existing?.paidAt) return;

  if (zeroOrNegative) {
    if (existing) {
      await context.db
        .update(employeePayrollPayments)
        .set({
          expectedAmount: input.expectedAmount,
          currency: input.currency,
          dueDate,
          paymentStatus: 'paid',
          paidAt: today,
          paidAmount: '0',
          paymentConfirmationSource: 'automatic_policy',
        })
        .where(eq(employeePayrollPayments.id, existing.id));
    }
    return;
  }

  let status: 'upcoming' | 'due' | 'overdue' = 'upcoming';
  if (dueDate < today) status = 'overdue';
  else if (dueDate === today) status = 'due';

  if (existing) {
    await context.db
      .update(employeePayrollPayments)
      .set({
        expectedAmount: input.expectedAmount,
        currency: input.currency,
        dueDate,
        paymentStatus: status,
      })
      .where(eq(employeePayrollPayments.id, existing.id));
    return;
  }

  await context.db.insert(employeePayrollPayments).values({
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    yearMonth: input.yearMonth,
    currency: input.currency,
    expectedAmount: input.expectedAmount,
    paymentStatus: status,
    dueDate,
  });
}

export async function confirmPayrollPaid(
  context: OrgContext,
  paymentId: string,
  input?: { readonly paidAt?: BusinessDate },
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const [row] = await context.db
    .select()
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.id, paymentId),
        eq(employeePayrollPayments.organizationId, context.organizationId),
        isNull(employeePayrollPayments.voidedAt),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Payroll payment');
  if (row.paidAt) {
    throw new DomainRuleError('Payroll already marked paid', 'workforce.errors.payrollAlreadyPaid');
  }

  const paidAt = input?.paidAt ?? todayInTimeZone(context.organization.timezone);

  await context.db
    .update(employeePayrollPayments)
    .set({
      paymentStatus: 'paid',
      paidAt,
      paidAmount: row.expectedAmount,
      paymentConfirmationSource: 'manual',
    })
    .where(eq(employeePayrollPayments.id, paymentId));

  await recordAuditEvent(context, {
    action: PAYROLL_CONFIRMED,
    entityType: 'employee_payroll_payment',
    entityId: paymentId,
    after: { paidAt, source: 'manual' },
  });
}

export async function voidPayrollPaymentConfirmation(
  context: OrgContext,
  paymentId: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

  const [row] = await context.db
    .select()
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.id, paymentId),
        eq(employeePayrollPayments.organizationId, context.organizationId),
        isNull(employeePayrollPayments.voidedAt),
      ),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Payroll payment');
  if (!row.paidAt) {
    throw new DomainRuleError('Payroll not marked paid', 'workforce.errors.payrollNotPaid');
  }

  const today = todayInTimeZone(context.organization.timezone);
  let status: 'upcoming' | 'due' | 'overdue' = 'upcoming';
  if (row.dueDate && row.dueDate < today) status = 'overdue';
  else if (row.dueDate === today) status = 'due';

  await context.db
    .update(employeePayrollPayments)
    .set({
      paymentStatus: status,
      paidAt: null,
      paidAmount: null,
      paymentConfirmationSource: null,
    })
    .where(eq(employeePayrollPayments.id, paymentId));

  await recordAuditEvent(context, {
    action: PAYROLL_VOIDED,
    entityType: 'employee_payroll_payment',
    entityId: paymentId,
  });
}

export async function syncAutomaticPayrollPayments(
  context: OrgContext,
  today: BusinessDate,
): Promise<number> {
  const policies = await getOrgFinancialPolicies(context);
  if (policies.salaryPaymentConfirmationMode !== 'automatic_on_day') return 0;
  if (today.slice(8, 10) !== String(policies.salaryPaymentDay).padStart(2, '0')) {
    return 0;
  }

  const rows = await context.db
    .select({ id: employeePayrollPayments.id, expectedAmount: employeePayrollPayments.expectedAmount })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.dueDate, today),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
      ),
    );

  let count = 0;
  for (const row of rows) {
    await context.db
      .update(employeePayrollPayments)
      .set({
        paymentStatus: 'paid',
        paidAt: today,
        paidAmount: row.expectedAmount,
        paymentConfirmationSource: 'automatic_policy',
      })
      .where(eq(employeePayrollPayments.id, row.id));

    await recordAuditEvent(context, {
      action: PAYROLL_CONFIRMED,
      entityType: 'employee_payroll_payment',
      entityId: row.id,
      after: {
        paidAt: today,
        source: 'automatic_policy',
        note: 'אושר אוטומטית לפי מדיניות שכר הארגון',
      },
    });
    count += 1;
  }
  return count;
}

export async function sumPaidPayrollInDateRange(
  context: OrgContext,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<string> {
  const [row] = await context.db
    .select({ total: sql<string>`coalesce(sum(${employeePayrollPayments.paidAmount}), 0)` })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.currency, currency),
        sql`${employeePayrollPayments.paidAt} >= ${fromDate}`,
        sql`${employeePayrollPayments.paidAt} <= ${toDate}`,
        isNull(employeePayrollPayments.voidedAt),
      ),
    );
  return row?.total ?? '0';
}

export async function getPayrollPayment(
  context: OrgContext,
  input: { readonly paymentId: string; readonly employeeId?: string },
) {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);

  const conditions = [
    eq(employeePayrollPayments.id, input.paymentId),
    eq(employeePayrollPayments.organizationId, context.organizationId),
    isNull(employeePayrollPayments.voidedAt),
  ];
  if (input.employeeId) {
    conditions.push(eq(employeePayrollPayments.employeeId, input.employeeId));
  }

  const [row] = await context.db
    .select({
      id: employeePayrollPayments.id,
      employeeId: employeePayrollPayments.employeeId,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      currency: employeePayrollPayments.currency,
      dueDate: employeePayrollPayments.dueDate,
      paymentStatus: employeePayrollPayments.paymentStatus,
      paidAt: employeePayrollPayments.paidAt,
    })
    .from(employeePayrollPayments)
    .where(and(...conditions))
    .limit(1);

  return row ?? null;
}

export async function listUnpaidPayrollPayments(context: OrgContext) {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);

  return context.db
    .select({
      id: employeePayrollPayments.id,
      employeeId: employeePayrollPayments.employeeId,
      employeeName: employees.name,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      currency: employeePayrollPayments.currency,
      dueDate: employeePayrollPayments.dueDate,
      paymentStatus: employeePayrollPayments.paymentStatus,
    })
    .from(employeePayrollPayments)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeePayrollPayments.employeeId),
        eq(employees.organizationId, context.organizationId),
      ),
    )
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
        sql`${employeePayrollPayments.expectedAmount} > 0`,
      ),
    );
}

export async function listPayrollDueToday(context: OrgContext, today: BusinessDate) {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);

  return context.db
    .select({
      id: employeePayrollPayments.id,
      employeeId: employeePayrollPayments.employeeId,
      employeeName: employees.name,
      yearMonth: employeePayrollPayments.yearMonth,
      expectedAmount: employeePayrollPayments.expectedAmount,
      currency: employeePayrollPayments.currency,
      dueDate: employeePayrollPayments.dueDate,
      paymentStatus: employeePayrollPayments.paymentStatus,
    })
    .from(employeePayrollPayments)
    .innerJoin(
      employees,
      and(
        eq(employees.id, employeePayrollPayments.employeeId),
        eq(employees.organizationId, context.organizationId),
      ),
    )
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
        eq(employeePayrollPayments.dueDate, today),
      ),
    );
}

export async function sumUpcomingPayrollCash(
  context: OrgContext,
  currency: string,
  today: BusinessDate,
  horizonEnd: BusinessDate,
): Promise<string> {
  const [row] = await context.db
    .select({ total: sql<string>`coalesce(sum(${employeePayrollPayments.expectedAmount}), 0)` })
    .from(employeePayrollPayments)
    .where(
      and(
        eq(employeePayrollPayments.organizationId, context.organizationId),
        eq(employeePayrollPayments.currency, currency),
        isNull(employeePayrollPayments.paidAt),
        isNull(employeePayrollPayments.voidedAt),
        sql`${employeePayrollPayments.dueDate} >= ${today}`,
        sql`${employeePayrollPayments.dueDate} <= ${horizonEnd}`,
      ),
    );
  return row?.total ?? '0';
}
