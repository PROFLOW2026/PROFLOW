import { z } from 'zod';
import { isBusinessDate } from '@/shared/dates';
import { MONTHLY_ALLOCATION_METHODS } from '../domain/monthly-cost-gates';
import {
  ATTENDANCE_DAY_STATUSES,
  ATTENDANCE_EVENT_SOURCES,
  ATTENDANCE_EVENT_TYPES,
} from '../domain/attendance';
import { EMPLOYEE_STATUSES, RATE_UNITS, TIME_APPROVAL_STATUSES, TIME_ENTRY_KINDS, TIME_ENTRY_STATUSES } from '../domain/types';

const businessDateSchema = z
  .string()
  .trim()
  .refine(isBusinessDate, { message: 'Invalid date' });

const moneyAmountSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[+]?\d+(\.\d+)?$/, { message: 'Invalid amount' });

const hoursSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[+]?\d+(\.\d+)?$/, { message: 'Invalid hours' })
  .refine((value) => Number(value) > 0, { message: 'Hours must be positive' });

const percentSchema = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, { message: 'Invalid percent' })
  .optional()
  .nullable();

const laborComponentSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(128),
    basis: z.enum(['amount', 'percent']),
    amount: moneyAmountSchema.optional().nullable(),
    percent: percentSchema,
    currency: z.string().trim().length(3).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.basis === 'amount' && !value.amount) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Amount required' });
    }
    if (value.basis === 'percent' && !value.percent) {
      ctx.addIssue({ code: 'custom', path: ['percent'], message: 'Percent required' });
    }
  });

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  rateUnit: z.enum(RATE_UNITS),
  baseRate: z.preprocess(
    (value) => (value === '' || value === null || value === undefined ? undefined : value),
    moneyAmountSchema.optional(),
  ),
  currency: z.string().trim().length(3).optional(),
  burdenPercent: percentSchema,
  validFrom: businessDateSchema.optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  userId: z.string().uuid().optional().nullable(),
  employeeNumber: z.string().trim().max(64).optional().nullable(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  components: z.array(laborComponentSchema).optional(),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  userId: z.string().uuid().optional().nullable(),
  employeeNumber: z.string().trim().max(64).optional().nullable(),
  jobTitle: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(64).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const createRateVersionSchema = z.object({
  employeeId: z.string().uuid(),
  validFrom: businessDateSchema,
  validTo: businessDateSchema.optional().nullable(),
  baseRate: moneyAmountSchema,
  rateUnit: z.enum(RATE_UNITS),
  currency: z.string().trim().length(3).optional(),
  burdenPercent: percentSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  components: z.array(laborComponentSchema).optional(),
});

export type CreateRateVersionInput = z.infer<typeof createRateVersionSchema>;

export const createTimeEntrySchema = z
  .object({
    employeeId: z.string().uuid(),
    workDate: businessDateSchema,
    hours: hoursSchema,
    kind: z.enum(TIME_ENTRY_KINDS).default('project'),
    projectId: z.string().uuid().optional().nullable(),
    workPackageId: z.string().uuid().optional().nullable(),
    phaseId: z.string().uuid().optional().nullable(),
    timeCodeId: z.string().uuid().optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'project' && !value.projectId) {
      ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'Project required' });
    }
    if (value.kind === 'non_project' && !value.timeCodeId) {
      ctx.addIssue({ code: 'custom', path: ['timeCodeId'], message: 'Time code required' });
    }
  });

export type CreateTimeEntryInput = z.infer<typeof createTimeEntrySchema>;

const weekdaySchema = z.coerce.number().int().min(0).max(6);

export const createBulkTimeEntriesSchema = z
  .object({
    employeeId: z.string().uuid(),
    fromDate: businessDateSchema,
    toDate: businessDateSchema,
    hours: hoursSchema.optional(),
    weekdays: z.array(weekdaySchema).min(1).max(7).optional(),
    dayHours: z
      .array(
        z.object({
          workDate: businessDateSchema,
          hours: hoursSchema,
        }),
      )
      .max(62)
      .optional(),
    kind: z.enum(TIME_ENTRY_KINDS).default('project'),
    projectId: z.string().uuid().optional().nullable(),
    workPackageId: z.string().uuid().optional().nullable(),
    phaseId: z.string().uuid().optional().nullable(),
    timeCodeId: z.string().uuid().optional().nullable(),
    description: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.toDate < value.fromDate) {
      ctx.addIssue({ code: 'custom', path: ['toDate'], message: 'End date must be on or after start date' });
    }
    if (!value.hours && !(value.dayHours && value.dayHours.length > 0)) {
      ctx.addIssue({ code: 'custom', path: ['hours'], message: 'Hours required' });
    }
    if (value.kind === 'project' && !value.projectId) {
      ctx.addIssue({ code: 'custom', path: ['projectId'], message: 'Project required' });
    }
    if (value.kind === 'non_project' && !value.timeCodeId) {
      ctx.addIssue({ code: 'custom', path: ['timeCodeId'], message: 'Time code required' });
    }
  });

export type CreateBulkTimeEntriesInput = z.infer<typeof createBulkTimeEntriesSchema>;

export const correctTimeEntrySchema = createTimeEntrySchema.and(
  z.object({
    correctsEntryId: z.string().uuid(),
  }),
);

export type CorrectTimeEntryInput = z.infer<typeof correctTimeEntrySchema>;

export const timeEntryFiltersSchema = z.object({
  employeeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  fromDate: businessDateSchema.optional(),
  toDate: businessDateSchema.optional(),
  kind: z.enum([...TIME_ENTRY_KINDS, 'all'] as const).optional(),
  status: z.enum([...TIME_ENTRY_STATUSES, 'all'] as const).optional(),
  approvalStatus: z.enum([...TIME_APPROVAL_STATUSES, 'all'] as const).optional(),
  timesheetId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type TimeEntryFiltersInput = z.infer<typeof timeEntryFiltersSchema>;

export const submitTimesheetSchema = z.object({
  employeeId: z.string().uuid(),
  periodStart: businessDateSchema.optional(),
  workDate: businessDateSchema.optional(),
  entryIds: z.array(z.string().uuid()).min(1).max(200).optional(),
});

export type SubmitTimesheetInput = z.infer<typeof submitTimesheetSchema>;

export const submitTimeEntriesSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(200),
});

export type SubmitTimeEntriesInput = z.infer<typeof submitTimeEntriesSchema>;

export const returnTimesheetSchema = z.object({
  timesheetId: z.string().uuid(),
  managerNote: z.string().trim().min(1).max(2000),
});

export type ReturnTimesheetInput = z.infer<typeof returnTimesheetSchema>;

export const approveTimesheetSchema = z.object({
  timesheetId: z.string().uuid(),
});

export type ApproveTimesheetInput = z.infer<typeof approveTimesheetSchema>;

export const approveTimeEntrySchema = z.object({
  timeEntryId: z.string().uuid(),
});

export type ApproveTimeEntryInput = z.infer<typeof approveTimeEntrySchema>;

export const bulkApproveTimeEntriesSchema = z.object({
  timeEntryIds: z.array(z.string().uuid()).min(1).max(200),
});

export type BulkApproveTimeEntriesInput = z.infer<typeof bulkApproveTimeEntriesSchema>;

export const updateTimeEntrySchema = z.object({
  timeEntryId: z.string().uuid(),
  hours: hoursSchema.optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateTimeEntryInput = z.infer<typeof updateTimeEntrySchema>;

export const timesheetFiltersSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum([...TIME_APPROVAL_STATUSES, 'all'] as const).optional(),
  fromDate: businessDateSchema.optional(),
  toDate: businessDateSchema.optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type TimesheetFiltersInput = z.infer<typeof timesheetFiltersSchema>;

export const addProjectTeamMemberSchema = z.object({
  projectId: z.string().uuid(),
  employeeId: z.string().uuid(),
  startDate: businessDateSchema.optional(),
  endDate: businessDateSchema.optional().nullable(),
  role: z.string().trim().max(200).optional().nullable(),
  plannedAllocationPercent: percentSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type AddProjectTeamMemberInput = z.infer<typeof addProjectTeamMemberSchema>;

export const removeProjectTeamMemberSchema = z.object({
  membershipId: z.string().uuid(),
});

export type RemoveProjectTeamMemberInput = z.infer<typeof removeProjectTeamMemberSchema>;

export const updateProjectTeamAssignmentSchema = z
  .object({
    membershipId: z.string().uuid(),
    startDate: businessDateSchema.optional(),
    endDate: businessDateSchema.optional().nullable(),
    role: z.string().trim().max(200).optional().nullable(),
    plannedAllocationPercent: percentSchema,
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (value) =>
      value.startDate !== undefined ||
      value.endDate !== undefined ||
      value.role !== undefined ||
      value.plannedAllocationPercent !== undefined ||
      value.notes !== undefined,
    { message: 'At least one field required' },
  );

export type UpdateProjectTeamAssignmentInput = z.infer<typeof updateProjectTeamAssignmentSchema>;

export const cancelProjectTeamAssignmentSchema = z.object({
  membershipId: z.string().uuid(),
});

export type CancelProjectTeamAssignmentInput = z.infer<typeof cancelProjectTeamAssignmentSchema>;

const yearMonthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Invalid year-month' });

const optionalMoneySchema = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, { message: 'Invalid amount' })
  .optional()
  .nullable()
  .or(z.literal(''));

export const monthlyAllocationLineSchema = z.object({
  projectId: z.string().uuid(),
  hours: optionalMoneySchema,
  days: optionalMoneySchema,
  percent: optionalMoneySchema,
  amount: optionalMoneySchema,
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const saveMonthlyEmployerCostDraftSchema = z.object({
  employeeId: z.string().uuid(),
  yearMonth: yearMonthSchema,
  estimatedAmount: optionalMoneySchema,
  actualAmount: optionalMoneySchema,
  notes: z.string().trim().max(4000).optional().nullable(),
  method: z.enum(MONTHLY_ALLOCATION_METHODS).optional(),
  allocationLines: z.array(monthlyAllocationLineSchema).optional(),
});

export type SaveMonthlyEmployerCostDraftInput = z.infer<typeof saveMonthlyEmployerCostDraftSchema>;

export const applyMonthlyEmployerCostAllocationSchema = z.object({
  employeeId: z.string().uuid(),
  yearMonth: yearMonthSchema,
  /** When omitted, applies the active draft run for the month. */
  runId: z.string().uuid().optional(),
});

export type ApplyMonthlyEmployerCostAllocationInput = z.infer<
  typeof applyMonthlyEmployerCostAllocationSchema
>;

export const loadMonthlyEmployerCostReviewSchema = z.object({
  employeeId: z.string().uuid(),
  yearMonth: yearMonthSchema.optional(),
});

export type LoadMonthlyEmployerCostReviewInput = z.infer<typeof loadMonthlyEmployerCostReviewSchema>;

const isoDateTimeSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), { message: 'Invalid timestamp' });

export const clockAttendanceSchema = z.object({
  eventType: z.enum(['clock_in', 'clock_out']),
  employeeId: z.string().uuid().optional(),
  workDate: businessDateSchema.optional(),
  occurredAt: isoDateTimeSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  source: z.enum(ATTENDANCE_EVENT_SOURCES).optional(),
});

export type ClockAttendanceInput = z.infer<typeof clockAttendanceSchema>;

export const manualAttendanceEventSchema = z.object({
  employeeId: z.string().uuid(),
  workDate: businessDateSchema,
  eventType: z.enum(ATTENDANCE_EVENT_TYPES),
  occurredAt: isoDateTimeSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  source: z.enum(ATTENDANCE_EVENT_SOURCES).optional(),
});

export type ManualAttendanceEventInput = z.infer<typeof manualAttendanceEventSchema>;

export const voidAttendanceEventSchema = z.object({
  eventId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type VoidAttendanceEventInput = z.infer<typeof voidAttendanceEventSchema>;

export const replaceAttendanceEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.enum(ATTENDANCE_EVENT_TYPES).optional(),
  occurredAt: isoDateTimeSchema.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ReplaceAttendanceEventInput = z.infer<typeof replaceAttendanceEventSchema>;

export const voidAttendanceDaySchema = z.object({
  dayId: z.string().uuid(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type VoidAttendanceDayInput = z.infer<typeof voidAttendanceDaySchema>;

export const attendanceFiltersSchema = z.object({
  employeeId: z.string().uuid().optional(),
  fromDate: businessDateSchema.optional(),
  toDate: businessDateSchema.optional(),
  status: z.enum([...ATTENDANCE_DAY_STATUSES, 'all'] as const).optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type AttendanceFiltersInput = z.infer<typeof attendanceFiltersSchema>;
