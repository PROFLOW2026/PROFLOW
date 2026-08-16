import { z } from 'zod';
import {
  EXTRACTION_JOB_STATUSES,
  OCR_CANDIDATE_FIELD_KEYS,
  OCR_DRAFT_TARGETS,
  OCR_WORKFLOW_CONTEXTS,
} from '../domain/types';

const fieldOverrideSchema = z.string().trim().max(2000).nullable().optional();

const extractionStatusSchema = z.enum(EXTRACTION_JOB_STATUSES);

export const extractReceiptSchema = z.object({
  documentId: z.string().uuid().nullable().optional(),
  contentBase64: z.string().max(20_000_000).optional(),
  mimeType: z.string().trim().max(200).optional(),
  filename: z.string().trim().max(500).optional(),
  workflow: z.enum(OCR_WORKFLOW_CONTEXTS).optional(),
  forceRetry: z.boolean().optional(),
  batchId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

export const createOcrBatchSchema = z.object({
  totalCount: z.number().int().min(0).max(50).optional(),
  documentIds: z.array(z.string().uuid()).max(50).optional(),
  extract: z
    .object({
      mimeType: z.string().trim().max(200).optional(),
      filename: z.string().trim().max(500).optional(),
      workflow: z.enum(OCR_WORKFLOW_CONTEXTS).optional(),
    })
    .optional(),
});

export const cancelOcrJobSchema = z.object({
  jobId: z.string().uuid(),
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
    /** Draft target - expense or vendor bill. Default expense. */
    draftTarget: z.enum(OCR_DRAFT_TARGETS).default('expense'),
    /**
     * Required when draftTarget is vendor_bill - OCR vendor text is never a UUID.
     */
    vendorId: z.string().uuid().optional().nullable(),
    rememberProjectId: z.string().uuid().optional().nullable(),
    rememberPurchaseOrderId: z.string().uuid().optional().nullable(),
    rememberSubcontractAgreementId: z.string().uuid().optional().nullable(),
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
        companyNumber: fieldOverrideSchema,
        vatId: fieldOverrideSchema,
        date: fieldOverrideSchema,
        dueDate: fieldOverrideSchema,
        reference: fieldOverrideSchema,
        orderNumber: fieldOverrideSchema,
        documentType: fieldOverrideSchema,
        description: fieldOverrideSchema,
        subtotal: fieldOverrideSchema,
        discount: fieldOverrideSchema,
        net: fieldOverrideSchema,
        tax: fieldOverrideSchema,
        vatRate: fieldOverrideSchema,
        gross: fieldOverrideSchema,
        amountDue: fieldOverrideSchema,
        currency: fieldOverrideSchema,
      })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.confirm &&
      (data.draftTarget === 'vendor_bill' || data.draftTarget === 'vendor_credit') &&
      !data.vendorId
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['vendorId'],
        message: 'Vendor is required to create a draft vendor bill or credit',
      });
    }
  });

export const ocrReviewSuggestionsProbeSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  vendorName: z.string().trim().max(500).optional().nullable(),
  companyNumber: z.string().trim().max(100).optional().nullable(),
  vatId: z.string().trim().max(100).optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  orderNumber: z.string().trim().max(200).optional().nullable(),
  currency: z.string().trim().max(10).optional().nullable(),
});

export const rejectOcrCandidateSchema = z.object({
  jobId: z.string().uuid(),
  rejectedFields: z.array(z.enum(OCR_CANDIDATE_FIELD_KEYS)).optional(),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type ExtractReceiptAppInput = z.infer<typeof extractReceiptSchema>;
export type CreateOcrBatchAppInput = z.infer<typeof createOcrBatchSchema>;
export type CancelOcrJobInput = z.infer<typeof cancelOcrJobSchema>;
export type ListOcrCandidatesInput = z.infer<typeof listOcrCandidatesSchema>;
/** Input type - `draftTarget` defaults to expense when omitted. */
export type ConfirmOcrCandidateInput = z.input<typeof confirmOcrCandidateSchema>;
export type RejectOcrCandidateInput = z.infer<typeof rejectOcrCandidateSchema>;
export type OcrReviewSuggestionsProbeInput = z.infer<typeof ocrReviewSuggestionsProbeSchema>;

export const ocrCandidateFieldKeySchema = z.enum(OCR_CANDIDATE_FIELD_KEYS);
