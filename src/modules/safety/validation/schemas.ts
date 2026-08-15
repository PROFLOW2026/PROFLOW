import { z } from 'zod';
import {
  SAFETY_ACTION_STATUSES,
  SAFETY_RECORD_STATUSES,
  SAFETY_RECORD_TYPES,
  SAFETY_SEVERITIES,
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

export const createSafetyRecordSchema = z.object({
  projectId: optionalUuid,
  recordType: z.enum(SAFETY_RECORD_TYPES),
  occurredAt: z.coerce.date(),
  severity: z.enum(SAFETY_SEVERITIES).optional().default('low'),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: z.string().trim().min(1, 'Description is required').max(8000),
  peopleInvolved: optionalText,
  immediateAction: optionalText,
  topic: optionalText,
  talkDate: optionalDate,
  talkNotes: optionalText,
  attendeeNames: z.array(z.string().trim().min(1).max(200)).optional(),
});

export type CreateSafetyRecordInput = z.input<typeof createSafetyRecordSchema>;

export const updateSafetyRecordSchema = z.object({
  safetyRecordId: z.string().uuid(),
  projectId: optionalUuid,
  recordType: z.enum(SAFETY_RECORD_TYPES).optional(),
  occurredAt: z.coerce.date().optional(),
  severity: z.enum(SAFETY_SEVERITIES).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(8000).optional(),
  peopleInvolved: optionalText,
  immediateAction: optionalText,
  status: z.enum(SAFETY_RECORD_STATUSES).optional(),
});

export type UpdateSafetyRecordInput = z.input<typeof updateSafetyRecordSchema>;

export const createCorrectiveActionSchema = z.object({
  safetyRecordId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(200),
  description: optionalText,
  ownerUserId: optionalUuid,
  dueDate: optionalDate,
});

export type CreateCorrectiveActionInput = z.input<typeof createCorrectiveActionSchema>;

export const updateCorrectiveActionSchema = z.object({
  actionId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText,
  ownerUserId: optionalUuid,
  dueDate: optionalDate,
  status: z.enum(SAFETY_ACTION_STATUSES).optional(),
});

export type UpdateCorrectiveActionInput = z.input<typeof updateCorrectiveActionSchema>;

export const addToolboxAttendeeSchema = z.object({
  safetyRecordId: z.string().uuid(),
  attendeeName: z.string().trim().min(1, 'Name is required').max(200),
  employeeId: optionalUuid,
});

export type AddToolboxAttendeeInput = z.input<typeof addToolboxAttendeeSchema>;

export const acknowledgeToolboxAttendeeSchema = z.object({
  attendeeId: z.string().uuid(),
});

export type AcknowledgeToolboxAttendeeInput = z.input<typeof acknowledgeToolboxAttendeeSchema>;

export const listSafetyRecordsSchema = z.object({
  projectId: z.string().uuid().optional(),
  recordType: z.enum(SAFETY_RECORD_TYPES).optional(),
  status: z.enum(SAFETY_RECORD_STATUSES).optional(),
  severity: z.enum(SAFETY_SEVERITIES).optional(),
});
