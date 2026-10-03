import { z } from 'zod';
import {
  COORDINATION_EVENT_KINDS,
  COORDINATION_OUTCOMES,
  COORDINATION_OVERRIDE_DECISIONS,
  COORDINATION_RESPONSE_STATUSES,
} from '@drizzle/schema';
import { ValidationError, type ValidationIssue } from '@/shared/errors';

/** Instants arrive as ISO strings, wall-clock strings (resolved in the org time zone) or Dates. */
const instantInput = z.union([z.string().trim().min(1), z.date()]);
const optionalInstantInput = z.union([z.string().trim(), z.date()]).optional().nullable();
const optionalUuid = z
  .union([z.string().uuid(), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

export const contractorInviteSchema = z.object({
  vendorId: z.string().uuid(),
  subcontractAgreementId: optionalUuid,
  tradeLabel: optionalText(80),
  isRequired: z.boolean().default(true),
});

export const createEventSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, 'coordination.validation.titleRequired').max(200),
  description: optionalText(4000),
  kind: z.enum(COORDINATION_EVENT_KINDS).default('other'),
  startsAt: instantInput,
  endsAt: optionalInstantInput,
  preparationDeadline: optionalInstantInput,
  locationId: optionalUuid,
  locationNote: optionalText(200),
  workPackageId: optionalUuid,
  phaseId: optionalUuid,
  requiredAcknowledgements: z.array(z.string().trim().max(200)).max(20).default([]),
  contractors: z.array(contractorInviteSchema).max(50).default([]),
  internalUserIds: z.array(z.string().uuid()).max(50).default([]),
  documentIds: z.array(z.string().uuid()).max(50).default([]),
});
export type CreateCoordinationEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  title: z.string().trim().min(1, 'coordination.validation.titleRequired').max(200),
  description: optionalText(4000),
  kind: z.enum(COORDINATION_EVENT_KINDS),
  preparationDeadline: optionalInstantInput,
  locationId: optionalUuid,
  locationNote: optionalText(200),
  workPackageId: optionalUuid,
  phaseId: optionalUuid,
  addAcknowledgements: z.array(z.string().trim().max(200)).max(20).default([]),
});
export type UpdateCoordinationEventInput = z.input<typeof updateEventSchema>;

export const inviteParticipantsSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  contractors: z.array(contractorInviteSchema).max(50).default([]),
  internalUserIds: z.array(z.string().uuid()).max(50).default([]),
});
export type InviteParticipantsInput = z.input<typeof inviteParticipantsSchema>;

export const updateParticipantSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  participantId: z.string().uuid(),
  isRequired: z.boolean().optional(),
  remove: z.boolean().optional(),
});
export type UpdateParticipantInput = z.input<typeof updateParticipantSchema>;

export const requestReadinessSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  participantIds: z.array(z.string().uuid()).max(50).optional(),
});
export type RequestReadinessInput = z.input<typeof requestReadinessSchema>;

const issueSchema = z.object({
  title: z.string().trim().min(1, 'coordination.validation.issueTitleRequired').max(200),
  description: optionalText(4000),
});

export const respondSchema = z
  .object({
    projectId: z.string().uuid(),
    eventId: z.string().uuid(),
    participantId: z.string().uuid(),
    status: z.enum(COORDINATION_RESPONSE_STATUSES),
    note: optionalText(4000),
    acknowledgedKeys: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    raiseIssue: issueSchema.optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.status === 'not_ready' || value.status === 'ready_with_conditions' || value.status === 'blocked') &&
      !value.note
    ) {
      ctx.addIssue({ code: 'custom', path: ['note'], message: 'coordination.validation.noteRequired' });
    }
  });
export type RespondToEventInput = z.input<typeof respondSchema>;

export const followUpTaskSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  participantId: z.string().uuid(),
  issueId: optionalUuid,
  title: z.string().trim().min(1, 'coordination.validation.issueTitleRequired').max(200),
  description: optionalText(4000),
  dueDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable()
    .or(z.literal('').transform(() => null)),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('high'),
});
export type CreateFollowUpTaskInput = z.input<typeof followUpTaskSchema>;

export const dismissIssueSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  issueId: z.string().uuid(),
});

export const overrideSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  decision: z.enum(COORDINATION_OVERRIDE_DECISIONS),
  reason: z.string().trim().min(3, 'coordination.validation.reasonRequired').max(2000),
});
export type OverrideReadinessInput = z.input<typeof overrideSchema>;

export const rescheduleSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  startsAt: instantInput,
  endsAt: optionalInstantInput,
  preparationDeadline: optionalInstantInput,
  reason: z.string().trim().min(3, 'coordination.validation.reasonRequired').max(2000),
  requiresReconfirmation: z.boolean().default(true),
});
export type RescheduleEventInput = z.input<typeof rescheduleSchema>;

export const outcomeSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  outcome: z.enum(COORDINATION_OUTCOMES),
  actualStartAt: optionalInstantInput,
  actualEndAt: optionalInstantInput,
  note: optionalText(4000),
});
export type RecordOutcomeInput = z.input<typeof outcomeSchema>;

export const linkDocumentSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  documentId: z.string().uuid(),
  contractorVisible: z.boolean().default(true),
});
export type LinkDocumentInput = z.input<typeof linkDocumentSchema>;

export const unlinkDocumentSchema = z.object({
  projectId: z.string().uuid(),
  eventId: z.string().uuid(),
  linkId: z.string().uuid(),
});

export function zodIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    ...(issue.message.startsWith('coordination.') ? { messageKey: issue.message } : {}),
  }));
}

export function parseOrThrow<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(zodIssues(parsed.error));
  return parsed.data;
}
