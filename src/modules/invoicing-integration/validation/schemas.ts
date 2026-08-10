import { z } from 'zod';
import { EXTERNAL_DOCUMENT_KINDS } from '../domain/types';

const moneySchema = z.object({
  amount: z.string().min(1),
  currency: z.string().length(3),
});

export const billingRecordBridgeSchema = z.object({
  billingRecordId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  kind: z.enum(['invoice', 'credit_note', 'advance', 'retention_release']),
  status: z.enum(['draft', 'finalized', 'void']),
  reference: z.string().max(120).nullable(),
  totalAmount: moneySchema,
  issueDate: z.string().min(1),
  dueDate: z.string().nullable(),
  notes: z.string().max(4000).nullable(),
});

export const requestExternalDocumentSchema = z.object({
  billing: billingRecordBridgeSchema,
  kind: z.enum(EXTERNAL_DOCUMENT_KINDS).default('tax_invoice'),
  idempotencyKey: z.string().min(8).max(128),
});

export const refreshExternalStatusSchema = z.object({
  externalDocumentId: z.string().uuid(),
});

export const creditExternalDocumentSchema = z.object({
  externalDocumentId: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const cancelExternalDocumentSchema = z.object({
  externalDocumentId: z.string().uuid(),
  reason: z.string().max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});

export const allocateExternalReferenceSchema = z.object({
  externalDocumentId: z.string().uuid(),
  allocationReference: z.string().min(1).max(120),
});

export const listExternalDocumentsSchema = z.object({
  billingRecordId: z.string().uuid(),
});

export type RequestExternalDocumentInput = z.infer<typeof requestExternalDocumentSchema>;
export type RefreshExternalStatusInput = z.infer<typeof refreshExternalStatusSchema>;
export type CreditExternalDocumentInput = z.infer<typeof creditExternalDocumentSchema>;
export type CancelExternalDocumentInput = z.infer<typeof cancelExternalDocumentSchema>;
export type AllocateExternalReferenceInput = z.infer<typeof allocateExternalReferenceSchema>;
export type ListExternalDocumentsInput = z.infer<typeof listExternalDocumentsSchema>;
