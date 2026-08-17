import { z } from 'zod';
import {
  WARRANTY_COVERAGE_STATUSES,
  WARRANTY_COVERAGE_TYPES,
  WARRANTY_ISSUE_STATUSES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);

export const createWarrantyCoverageSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  coverageType: z.enum(WARRANTY_COVERAGE_TYPES).optional().default('workmanship'),
  workPackageId: optionalUuid,
  vendorId: optionalUuid,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText,
  reminderDaysBefore: z.coerce.number().int().min(0).max(3650).optional().default(30),
});
export type CreateWarrantyCoverageInput = z.input<typeof createWarrantyCoverageSchema>;

export const updateWarrantyCoverageSchema = z.object({
  coverageId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  coverageType: z.enum(WARRANTY_COVERAGE_TYPES).optional(),
  workPackageId: optionalUuid,
  vendorId: optionalUuid,
  startDate: optionalDate,
  endDate: optionalDate,
  notes: optionalText,
  reminderDaysBefore: z.coerce.number().int().min(0).max(3650).optional(),
  status: z.enum(WARRANTY_COVERAGE_STATUSES).optional(),
});
export type UpdateWarrantyCoverageInput = z.input<typeof updateWarrantyCoverageSchema>;

export const createWarrantyIssueSchema = z.object({
  coverageId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  notes: optionalText,
});
export type CreateWarrantyIssueInput = z.input<typeof createWarrantyIssueSchema>;

export const updateWarrantyIssueSchema = z.object({
  issueId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  notes: optionalText,
  status: z.enum(WARRANTY_ISSUE_STATUSES).optional(),
});
export type UpdateWarrantyIssueInput = z.input<typeof updateWarrantyIssueSchema>;

export const createWarrantyWorkOrderSchema = z.object({
  issueId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  assigneeEmployeeId: optionalUuid,
});
export type CreateWarrantyWorkOrderInput = z.input<typeof createWarrantyWorkOrderSchema>;
