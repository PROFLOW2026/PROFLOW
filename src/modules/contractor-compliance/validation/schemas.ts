import { z } from 'zod';
import { COMPLIANCE_REQUIREMENT_KINDS } from '../domain/types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

export const createRequirementSchema = z
  .object({
    projectId: z.string().uuid(),
    agreementId: z.string().uuid(),
    kind: z.enum(COMPLIANCE_REQUIREMENT_KINDS),
    title: z.string().trim().min(1).max(200),
    description: optionalText(2000),
    isRequired: z.boolean().default(true),
    blocksPayment: z.boolean().default(true),
    requiresExpiry: z.boolean().default(true),
    warningDays: z.number().int().min(0).max(365).default(30),
  })
  .transform((value) => ({ ...value, blocksPayment: value.isRequired && value.blocksPayment }));
export type CreateRequirementInput = z.input<typeof createRequirementSchema>;

export const updateRequirementSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText(2000),
  isRequired: z.boolean().optional(),
  blocksPayment: z.boolean().optional(),
  requiresExpiry: z.boolean().optional(),
  warningDays: z.number().int().min(0).max(365).optional(),
});
export type UpdateRequirementInput = z.input<typeof updateRequirementSchema>;

export const applyStandardSetSchema = z.object({
  projectId: z.string().uuid(),
  /** Omit = every active agreement on the project. */
  agreementIds: z.array(z.string().uuid()).max(200).optional(),
  titles: z.record(z.string(), z.string().trim().min(1).max(200)),
});
export type ApplyStandardSetInput = z.input<typeof applyStandardSetSchema>;

export const submitDocumentSchema = z.object({
  projectId: z.string().uuid(),
  requirementId: z.string().uuid(),
  referenceNumber: optionalText(120),
  issuer: optionalText(200),
  issuedOn: isoDate.optional().nullable().transform((value) => value ?? null),
  expiresOn: isoDate.optional().nullable().transform((value) => value ?? null),
  notes: optionalText(2000),
});
export type SubmitDocumentInput = z.input<typeof submitDocumentSchema>;

export const internalSubmitDocumentSchema = submitDocumentSchema.extend({
  documentId: z.string().uuid().optional().nullable().transform((value) => value ?? null),
  /** Reuse an existing organization compliance artifact (subject vendor) as the evidence. */
  complianceArtifactId: z.string().uuid().optional().nullable().transform((value) => value ?? null),
  /** Internal submissions may be approved in the same step. */
  approve: z.boolean().default(false),
});
export type InternalSubmitDocumentInput = z.input<typeof internalSubmitDocumentSchema>;

export const reviewDocumentSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  note: optionalText(2000),
});
export type ReviewDocumentInput = z.input<typeof reviewDocumentSchema>;
