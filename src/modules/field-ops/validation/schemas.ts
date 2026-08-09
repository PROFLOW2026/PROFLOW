import { z } from 'zod';
import {
  INSPECTION_KINDS,
  INSPECTION_STATUSES,
  PUNCH_PRIORITIES,
  PUNCH_STATUSES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional());

const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

const requiredDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const createDailyLogSchema = z.object({
  projectId: z.string().uuid(),
  workPackageId: optionalUuid,
  logDate: requiredDate,
  weather: optionalText,
  summary: z.string().trim().min(1, 'Summary is required').max(4000),
  workforceNotes: optionalText,
});

export type CreateDailyLogInput = z.input<typeof createDailyLogSchema>;

export const updateDailyLogSchema = z.object({
  dailyLogId: z.string().uuid(),
  workPackageId: optionalUuid,
  logDate: requiredDate.optional(),
  weather: optionalText,
  summary: z.string().trim().min(1).max(4000).optional(),
  workforceNotes: optionalText,
});

export type UpdateDailyLogInput = z.input<typeof updateDailyLogSchema>;

export const createPunchListItemSchema = z.object({
  projectId: z.string().uuid(),
  workPackageId: optionalUuid,
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText,
  priority: z.enum(PUNCH_PRIORITIES).optional().default('normal'),
  location: optionalText,
  dueDate: optionalDate,
});

export type CreatePunchListItemInput = z.input<typeof createPunchListItemSchema>;

export const updatePunchListItemSchema = z.object({
  punchListItemId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText,
  status: z.enum(PUNCH_STATUSES).optional(),
  priority: z.enum(PUNCH_PRIORITIES).optional(),
  location: optionalText,
  dueDate: optionalDate,
  workPackageId: optionalUuid,
});

export type UpdatePunchListItemInput = z.input<typeof updatePunchListItemSchema>;

export const createInspectionSchema = z.object({
  projectId: z.string().uuid(),
  workPackageId: optionalUuid,
  title: z.string().trim().min(1, 'Title is required').max(200),
  kind: z.enum(INSPECTION_KINDS).optional().default('general'),
  scheduledOn: optionalDate,
  notes: optionalText,
});

export type CreateInspectionInput = z.input<typeof createInspectionSchema>;

export const updateInspectionSchema = z.object({
  inspectionId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(INSPECTION_KINDS).optional(),
  status: z.enum(INSPECTION_STATUSES).optional(),
  scheduledOn: optionalDate,
  completedOn: optionalDate,
  result: optionalText,
  notes: optionalText,
  workPackageId: optionalUuid,
});

export type UpdateInspectionInput = z.input<typeof updateInspectionSchema>;

export const listByProjectSchema = z.object({
  projectId: z.string().uuid().optional(),
});
