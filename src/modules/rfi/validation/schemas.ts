import { z } from 'zod';
import { RFI_PRIORITIES } from '../domain/types';

/** '' -> null (clear the field); undefined stays undefined (leave the field unchanged). */
const emptyToNull = (value: unknown) => {
  if (value === '' || value === null) return null;
  return value;
};

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .nullable()
    .optional(),
);
const optionalLabel = z.preprocess(emptyToNull, z.string().trim().max(300).nullable().optional());

const subject = z.string().trim().min(1, 'Subject is required').max(300);
const question = z.string().trim().min(1, 'Question is required').max(20000);

/** Fields any author may set; refs to other tracks are plain ids (validated by composite FKs). */
const sharedFields = {
  locationId: optionalUuid,
  drawingId: optionalUuid,
  drawingRevisionId: optionalUuid,
  drawingReference: optionalLabel,
  workPackageId: optionalUuid,
  priority: z.enum(RFI_PRIORITIES).optional(),
  dueDate: optionalDate,
};

export const createInternalRfiSchema = z.object({
  projectId: z.string().uuid(),
  subject,
  question,
  /** Contractor agreement on the project; the vendor is derived from it. */
  subcontractAgreementId: optionalUuid,
  assigneeUserId: optionalUuid,
  submit: z.boolean().optional().default(false),
  ...sharedFields,
});
export type CreateInternalRfiInput = z.input<typeof createInternalRfiSchema>;

export const updateInternalRfiSchema = z.object({
  rfiId: z.string().uuid(),
  subject: subject.optional(),
  question: question.optional(),
  subcontractAgreementId: optionalUuid,
  assigneeUserId: optionalUuid,
  ...sharedFields,
});
export type UpdateInternalRfiInput = z.input<typeof updateInternalRfiSchema>;

export const createExternalRfiSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  /** Optional when the principal acts for exactly one vendor on the project. */
  vendorId: optionalUuid,
  subject,
  question,
  submit: z.boolean().optional().default(false),
  ...sharedFields,
});
export type CreateExternalRfiInput = z.input<typeof createExternalRfiSchema>;

export const updateExternalRfiSchema = z.object({
  organizationId: z.string().uuid(),
  rfiId: z.string().uuid(),
  subject: subject.optional(),
  question: question.optional(),
  ...sharedFields,
});
export type UpdateExternalRfiInput = z.input<typeof updateExternalRfiSchema>;

export const rfiTransitionSchema = z.object({
  rfiId: z.string().uuid(),
  reason: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional()),
});
export type RfiTransitionInput = z.input<typeof rfiTransitionSchema>;

export const answerRfiSchema = z.object({
  rfiId: z.string().uuid(),
  body: z.string().trim().min(1, 'Answer is required').max(20000),
  /** Close immediately after answering. */
  close: z.boolean().optional().default(false),
});
export type AnswerRfiInput = z.input<typeof answerRfiSchema>;

export const listRfisSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum(['draft', 'submitted', 'under_review', 'answered', 'closed', 'open', 'overdue']).optional(),
  vendorId: optionalUuid,
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListRfisInput = z.input<typeof listRfisSchema>;
