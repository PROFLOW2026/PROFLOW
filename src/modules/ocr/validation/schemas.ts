import { z } from 'zod';
import {
  EXTRACTION_JOB_STATUSES,
  OCR_CANDIDATE_FIELD_KEYS,
  OCR_DRAFT_TARGETS,
} from '../domain/types';

const fieldOverrideSchema = z.string().trim().max(2000).nullable().optional();

const extractionStatusSchema = z.enum(EXTRACTION_JOB_STATUSES);

export const extractReceiptSchema = z.object({
  documentId: z.string().uuid().nullable().optional(),
  contentBase64: z.string().max(20_000_000).optional(),
  mimeType: z.string().trim().max(200).optional(),
  filename: z.string().trim().max(500).optional(),
});

export const listOcrCandidatesSchema = z.object({
  status: z
    .union([extractionStatusSchema, z.array(extractionStatusSchema).min(1)])
    .optional(),
});

export const confirmOcrCandidateSchema = z
  .object({
    jobId: z.string().uuid(),
    /** Explicit human confirm. Draft is created only when this is true. */
    confirm: z.boolean(),
    /** Draft target — expense or vendor bill. Default expense. */
    draftTarget: z.enum(OCR_DRAFT_TARGETS).default('expense'),
    /**
     * Required when draftTarget is vendor_bill — OCR vendor text is never a UUID.
     */
    vendorId: z.string().uuid().optional().nullable(),
    /**
     * Fields the reviewer explicitly accepts for mapping.
     * Empty → domain refuses (OCR is never auto-canonical).
     */
    acceptedFields: z.array(z.enum(OCR_CANDIDATE_FIELD_KEYS)).min(1),
    /** Optional explicit field rejections retained for audit. */
    rejectedFields: z.array(z.enum(OCR_CANDIDATE_FIELD_KEYS)).optional(),
    fieldOverrides: z
      .object({
        vendor: fieldOverrideSchema,
        date: fieldOverrideSchema,
        dueDate: fieldOverrideSchema,
        reference: fieldOverrideSchema,
        description: fieldOverrideSchema,
        net: fieldOverrideSchema,
        tax: fieldOverrideSchema,
        gross: fieldOverrideSchema,
        currency: fieldOverrideSchema,
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.confirm && data.draftTarget === 'vendor_bill' && !data.vendorId) {
      ctx.addIssue({
        code: 'custom',
        path: ['vendorId'],
        message: 'Vendor is required to create a draft vendor bill',
      });
    }
  });

export const rejectOcrCandidateSchema = z.object({
  jobId: z.string().uuid(),
  rejectedFields: z.array(z.enum(OCR_CANDIDATE_FIELD_KEYS)).optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type ExtractReceiptAppInput = z.infer<typeof extractReceiptSchema>;
export type ListOcrCandidatesInput = z.infer<typeof listOcrCandidatesSchema>;
/** Input type — `draftTarget` defaults to expense when omitted. */
export type ConfirmOcrCandidateInput = z.input<typeof confirmOcrCandidateSchema>;
export type RejectOcrCandidateInput = z.infer<typeof rejectOcrCandidateSchema>;

export const ocrCandidateFieldKeySchema = z.enum(OCR_CANDIDATE_FIELD_KEYS);
