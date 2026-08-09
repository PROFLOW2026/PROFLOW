import { z } from 'zod';
import { EXTRACTION_JOB_STATUSES, OCR_CANDIDATE_FIELD_KEYS } from '../domain/types';

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

export const confirmOcrCandidateSchema = z.object({
  jobId: z.string().uuid(),
  /** Explicit human confirm. Draft expense is created only when this is true. */
  confirm: z.boolean(),
  /**
   * Fields the reviewer explicitly accepts for mapping.
   * Empty → domain refuses (OCR is never auto-canonical).
   */
  acceptedFields: z.array(z.enum(OCR_CANDIDATE_FIELD_KEYS)).min(1),
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
});

export type ExtractReceiptAppInput = z.infer<typeof extractReceiptSchema>;
export type ListOcrCandidatesInput = z.infer<typeof listOcrCandidatesSchema>;
export type ConfirmOcrCandidateInput = z.infer<typeof confirmOcrCandidateSchema>;

export const ocrCandidateFieldKeySchema = z.enum(OCR_CANDIDATE_FIELD_KEYS);
