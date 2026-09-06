import { relations, sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  pgTable,
} from 'drizzle-orm/pg-core';
import { currencyCode, moneyAmount, primaryId, timestamps } from './_shared';
import { employees } from './workforce';
import { organizations } from './tenancy';
import { profiles } from './identity';

/**
 * Owner business decisions (migration 0078).
 * Payroll payment visibility — not a payroll engine.
 */

export const employeePayrollPayments = pgTable(
  'employee_payroll_payments',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    /** Payroll period YYYY-MM (work month being paid). */
    yearMonth: char('year_month', { length: 7 }).notNull(),
    currency: currencyCode().notNull(),
    /** Expected employer cost for the period (from workforce recognition). */
    expectedAmount: moneyAmount('expected_amount').notNull(),
    /** Cash paid when confirmed. */
    paidAmount: moneyAmount('paid_amount'),
    paymentStatus: text('payment_status').notNull().default('upcoming'),
    /** Scheduled org salary payment day for this period (e.g. pay August on Sep 10). */
    dueDate: date('due_date', { mode: 'string' }),
    paidAt: date('paid_at', { mode: 'string' }),
    paymentConfirmationSource: text('payment_confirmation_source'),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidedByUserId: uuid('voided_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_payroll_payments_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('employee_payroll_payments_active_employee_month_uq')
      .on(table.organizationId, table.employeeId, table.yearMonth)
      .where(sql`${table.voidedAt} IS NULL`),
    index('employee_payroll_payments_org_due_idx').on(table.organizationId, table.dueDate),
    index('employee_payroll_payments_org_status_idx').on(table.organizationId, table.paymentStatus),
    foreignKey({
      name: 'employee_payroll_payments_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check(
      'employee_payroll_payments_year_month_shape',
      sql`${table.yearMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      'employee_payroll_payments_status_known',
      sql`${table.paymentStatus} IN ('upcoming', 'due', 'paid', 'overdue')`,
    ),
    check(
      'employee_payroll_payments_confirmation_source_known',
      sql`${table.paymentConfirmationSource} IS NULL
          OR ${table.paymentConfirmationSource} IN ('manual', 'automatic_policy')`,
    ),
    check('employee_payroll_payments_expected_non_negative', sql`${table.expectedAmount} >= 0`),
    check(
      'employee_payroll_payments_paid_shape',
      sql`(${table.paymentStatus} <> 'paid')
          OR (${table.paidAmount} IS NOT NULL AND ${table.paidAt} IS NOT NULL
              AND ${table.paymentConfirmationSource} IS NOT NULL)`,
    ),
  ],
);

/**
 * Simple Owner attendance outcome — separate from clock events.
 * Missing row on a work day within employment = missing report (computed).
 */
export const employeeAttendanceOutcomes = pgTable(
  'employee_attendance_outcomes',
  {
    id: primaryId(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    /** worked | not_worked */
    outcome: text('outcome').notNull(),
    absenceReason: text('absence_reason'),
    /** paid | unpaid — required when outcome = not_worked */
    absenceCompensation: text('absence_compensation'),
    notes: text('notes'),
    createdByUserId: uuid('created_by_user_id').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('employee_attendance_outcomes_id_org_uq').on(table.id, table.organizationId),
    uniqueIndex('employee_attendance_outcomes_employee_date_uq').on(
      table.organizationId,
      table.employeeId,
      table.workDate,
    ),
    index('employee_attendance_outcomes_org_date_idx').on(table.organizationId, table.workDate),
    foreignKey({
      name: 'employee_attendance_outcomes_employee_org_fk',
      columns: [table.employeeId, table.organizationId],
      foreignColumns: [employees.id, employees.organizationId],
    }).onDelete('cascade'),
    check(
      'employee_attendance_outcomes_outcome_known',
      sql`${table.outcome} IN ('worked', 'not_worked')`,
    ),
    check(
      'employee_attendance_outcomes_absence_reason_known',
      sql`${table.absenceReason} IS NULL
          OR ${table.absenceReason} IN (
            'unpaid_leave', 'vacation', 'sick', 'rest_day', 'other'
          )`,
    ),
    check(
      'employee_attendance_outcomes_compensation_known',
      sql`${table.absenceCompensation} IS NULL
          OR ${table.absenceCompensation} IN ('paid', 'unpaid')`,
    ),
    check(
      'employee_attendance_outcomes_not_worked_shape',
      sql`(${table.outcome} = 'worked'
          AND ${table.absenceReason} IS NULL
          AND ${table.absenceCompensation} IS NULL)
          OR (${table.outcome} = 'not_worked'
              AND ${table.absenceReason} IS NOT NULL
              AND ${table.absenceCompensation} IS NOT NULL)`,
    ),
  ],
);

export const employeePayrollPaymentsRelations = relations(employeePayrollPayments, ({ one }) => ({
  employee: one(employees, {
    fields: [employeePayrollPayments.employeeId],
    references: [employees.id],
  }),
}));

export const employeeAttendanceOutcomesRelations = relations(
  employeeAttendanceOutcomes,
  ({ one }) => ({
    employee: one(employees, {
      fields: [employeeAttendanceOutcomes.employeeId],
      references: [employees.id],
    }),
  }),
);
