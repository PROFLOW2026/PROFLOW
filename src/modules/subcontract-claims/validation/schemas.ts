import { z } from 'zod';
import { DEDUCTION_TYPES, PAYMENT_HOLD_KINDS } from '../domain/types';

/** NET decimal amounts as strings (never floats). */
const amount = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,6})?$/, 'subcontractClaims.validation.amount');
const nonNegativeAmount = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,6})?$/, 'subcontractClaims.validation.amountNonNegative');
const positiveAmount = nonNegativeAmount.refine((value) => !/^0+(\.0+)?$/.test(value), {
  message: 'subcontractClaims.validation.amountPositive',
});
const percent = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,4})?$/, 'subcontractClaims.validation.percent')
  .refine((value) => Number.parseFloat(value) <= 100, { message: 'subcontractClaims.validation.percent' });
const isoDate = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'subcontractClaims.validation.date');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));
const requiredText = (max: number) => z.string().trim().min(1, 'subcontractClaims.validation.required').max(max);

export const claimLineInputSchema = z.object({
  workLineId: z.string().uuid(),
  currentAmount: amount,
  progressPercent: percent.optional().nullable(),
  cumulativeQuantity: nonNegativeAmount.optional().nullable(),
  note: optionalText(2000),
});
export type ClaimLineInput = z.input<typeof claimLineInputSchema>;

export const createClaimSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  periodStart: isoDate,
  periodEnd: isoDate,
  title: optionalText(200),
});
export type CreateClaimInput = z.input<typeof createClaimSchema>;

export const createExternalClaimSchema = createClaimSchema.extend({
  organizationId: z.string().uuid(),
});
export type CreateExternalClaimInput = z.input<typeof createExternalClaimSchema>;

export const saveClaimDraftSchema = z.object({
  periodStart: isoDate.optional(),
  periodEnd: isoDate.optional(),
  title: optionalText(200),
  note: optionalText(4000),
  lines: z.array(claimLineInputSchema).max(2000),
});
export type SaveClaimDraftInput = z.input<typeof saveClaimDraftSchema>;

export const reasonSchema = z.object({ reason: requiredText(4000) });
export type ReasonInput = z.input<typeof reasonSchema>;

export const requestEvidenceSchema = z.object({
  reason: requiredText(4000),
  claimLineId: z.string().uuid().optional().nullable(),
});
export type RequestEvidenceInput = z.input<typeof requestEvidenceSchema>;

export const certifyClaimSchema = z.object({
  lines: z
    .array(
      z.object({
        claimLineId: z.string().uuid(),
        certifiedAmount: nonNegativeAmount,
        reason: optionalText(4000),
      }),
    )
    .min(1)
    .max(2000),
});
export type CertifyClaimInput = z.input<typeof certifyClaimSchema>;

export const reassessClaimSchema = z.object({
  reason: requiredText(4000),
  lines: z
    .array(z.object({ claimLineId: z.string().uuid(), certifiedAmount: nonNegativeAmount }))
    .min(1)
    .max(2000),
});
export type ReassessClaimInput = z.input<typeof reassessClaimSchema>;

export const issueDeductionSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  claimId: z.string().uuid().optional().nullable(),
  deductionType: z.enum(DEDUCTION_TYPES),
  amount: positiveAmount,
  reason: requiredText(4000),
  contractorVisible: z.boolean().default(true),
});
export type IssueDeductionInput = z.input<typeof issueDeductionSchema>;

export const disputeCommentSchema = z.object({ comment: requiredText(4000) });
export type DisputeCommentInput = z.input<typeof disputeCommentSchema>;

export const placeHoldSchema = z.object({
  projectId: z.string().uuid(),
  agreementId: z.string().uuid(),
  claimId: z.string().uuid().optional().nullable(),
  holdKind: z.enum(PAYMENT_HOLD_KINDS),
  note: optionalText(2000),
  contractorVisible: z.boolean().default(true),
});
export type PlaceHoldInput = z.input<typeof placeHoldSchema>;

export const releaseHoldSchema = z.object({ releaseNote: optionalText(2000) });
export type ReleaseHoldInput = z.input<typeof releaseHoldSchema>;
