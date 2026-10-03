import { z } from 'zod';
import { SUBMITTAL_REVIEW_DECISIONS, SUBMITTAL_STATUSES, SUBMITTAL_TYPES } from '../domain/types';

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
const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable().optional());

const title = z.string().trim().min(1, 'Title is required').max(300);

const sharedFields = {
  type: z.enum(SUBMITTAL_TYPES),
  title,
  description: optionalText(20000),
  specSection: optionalText(120),
  locationId: optionalUuid,
  drawingId: optionalUuid,
  drawingRevisionId: optionalUuid,
  drawingReference: optionalText(300),
  workPackageId: optionalUuid,
  /** Notes of the first revision. */
  notes: optionalText(20000),
};

export const createInternalSubmittalSchema = z.object({
  projectId: z.string().uuid(),
  /** Internal registration on behalf of a contractor: the agreement determines the vendor. */
  subcontractAgreementId: z.string().uuid(),
  dueDate: optionalDate,
  reviewerUserId: optionalUuid,
  ...sharedFields,
});
export type CreateInternalSubmittalInput = z.input<typeof createInternalSubmittalSchema>;

const patchFields = {
  type: z.enum(SUBMITTAL_TYPES).optional(),
  title: title.optional(),
  description: optionalText(20000),
  specSection: optionalText(120),
  locationId: optionalUuid,
  drawingId: optionalUuid,
  drawingRevisionId: optionalUuid,
  drawingReference: optionalText(300),
  workPackageId: optionalUuid,
};

export const updateInternalSubmittalSchema = z.object({
  submittalId: z.string().uuid(),
  dueDate: optionalDate,
  reviewerUserId: optionalUuid,
  ...patchFields,
});
export type UpdateInternalSubmittalInput = z.input<typeof updateInternalSubmittalSchema>;

export const createExternalSubmittalSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  vendorId: optionalUuid,
  ...sharedFields,
});
export type CreateExternalSubmittalInput = z.input<typeof createExternalSubmittalSchema>;

export const updateExternalSubmittalSchema = z.object({
  organizationId: z.string().uuid(),
  submittalId: z.string().uuid(),
  ...patchFields,
});
export type UpdateExternalSubmittalInput = z.input<typeof updateExternalSubmittalSchema>;

export const revisionNotesSchema = z.object({
  submittalId: z.string().uuid(),
  notes: optionalText(20000),
});
export type RevisionNotesInput = z.input<typeof revisionNotesSchema>;

export const submittalActionSchema = z.object({
  submittalId: z.string().uuid(),
});
export type SubmittalActionInput = z.input<typeof submittalActionSchema>;

export const reviewSubmittalSchema = z.object({
  submittalId: z.string().uuid(),
  /** Guards against reviewing a revision that was superseded while the reviewer was reading. */
  revisionId: z.string().uuid(),
  decision: z.enum(SUBMITTAL_REVIEW_DECISIONS),
  comments: optionalText(20000),
});
export type ReviewSubmittalInput = z.input<typeof reviewSubmittalSchema>;

export const listSubmittalsSchema = z.object({
  projectId: z.string().uuid(),
  status: z.enum([...SUBMITTAL_STATUSES, 'pending', 'action_required', 'overdue']).optional(),
  type: z.enum(SUBMITTAL_TYPES).optional(),
  vendorId: optionalUuid,
  limit: z.number().int().min(1).max(200).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});
export type ListSubmittalsInput = z.input<typeof listSubmittalsSchema>;
