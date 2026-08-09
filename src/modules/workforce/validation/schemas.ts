import { z } from 'zod';
import { isBusinessDate } from '@/shared/dates';
import { EMPLOYEE_STATUSES, RATE_UNITS, TIME_ENTRY_KINDS } from '../domain/types';

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

export const timeEntryFiltersSchema = z.object({
  employeeId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  fromDate: businessDateSchema.optional(),
  toDate: businessDateSchema.optional(),
  kind: z.enum([...TIME_ENTRY_KINDS, 'all'] as const).optional(),
});

export type TimeEntryFiltersInput = z.infer<typeof timeEntryFiltersSchema>;
