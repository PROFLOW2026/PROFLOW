import { z } from 'zod';
import { SITE_INSTRUCTION_CATEGORIES, SITE_INSTRUCTION_STATUSES } from '@drizzle/schema';
import { optionalIsoDate, optionalText, optionalUuid } from '@/modules/site-log/shared/validation';

export const issueInstructionSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  subcontractAgreementId: optionalUuid,
  title: z.string().trim().min(1, 'Title is required').max(300),
  description: optionalText(8000),
  category: z.enum(SITE_INSTRUCTION_CATEGORIES).default('operational'),
  locationId: optionalUuid,
  dueDate: optionalIsoDate,
  logDate: optionalIsoDate,
  meetingId: optionalUuid,
});
export type IssueInstructionInput = z.input<typeof issueInstructionSchema>;

export const updateInstructionSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(300),
  description: optionalText(8000),
  locationId: optionalUuid,
  dueDate: optionalIsoDate,
});
export type UpdateInstructionInput = z.input<typeof updateInstructionSchema>;

export const INTERNAL_INSTRUCTION_TRANSITIONS = [
  'acknowledged',
  'performed',
  'closed',
  'cancelled',
  'reopened',
  'conversion_dismissed',
] as const;

export const transitionInstructionSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  event: z.enum(INTERNAL_INSTRUCTION_TRANSITIONS),
  note: optionalText(4000),
});
export type TransitionInstructionInput = z.input<typeof transitionInstructionSchema>;

export const instructionNoteSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  note: z.string().trim().min(1).max(4000),
});

export const INSTRUCTION_CONVERSION_TARGETS = ['change', 'unpriced_work'] as const;
export type InstructionConversionTarget = (typeof INSTRUCTION_CONVERSION_TARGETS)[number];

export const requestConversionSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  target: z.enum(INSTRUCTION_CONVERSION_TARGETS),
  note: optionalText(4000),
});

/** Links the instruction to an already-existing Track E record (change / unpriced work). */
export const linkConversionSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  targetType: z.string().regex(/^[a-z][a-z0-9_]*$/).max(60),
  targetId: z.string().uuid(),
});

export const externalInstructionActionSchema = z.object({
  projectId: z.string().uuid(),
  instructionId: z.string().uuid(),
  note: optionalText(4000),
});

export const listInstructionsFilterSchema = z.object({
  status: z.enum([...SITE_INSTRUCTION_STATUSES, 'open', 'all']).optional().default('open'),
  vendorId: optionalUuid,
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});
export type ListInstructionsFilter = z.input<typeof listInstructionsFilterSchema>;
