import { z } from 'zod';
import type { BillingRecordBridgeRef } from '../domain/types';
import { EXTERNAL_DOCUMENT_KINDS } from '../domain/types';

const moneySchema = z.object({
  amount: z.string().min(1),
  currency: z.string().length(3),
});

const partySnapshotSchema = z.object({
  name: z.string().min(1),
  companyNumber: z.string().max(64).nullable(),
  externalIdentifier: z.string().max(128).nullable(),
  email: z.string().max(320).nullable(),
  phone: z.string().max(64).nullable(),
  address: z.string().max(500).nullable(),
  city: z.string().max(120).nullable(),
  postalCode: z.string().max(32).nullable(),
  noVat: z.boolean(),
});

const lineItemSchema = z.object({
  description: z.string().min(1),
  lineNet: moneySchema,
  quantity: z.string().nullable(),
  unitPrice: z.string().nullable(),
});

export const billingRecordBridgeSchema = z.object({
  billingRecordId: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  clientId: z.string().uuid().nullable(),
  kind: z.enum(['invoice', 'credit_note', 'advance', 'retention_release']),
  status: z.enum(['draft', 'finalized', 'void']),
  reference: z.string().max(120).nullable(),
  subtotalAmount: moneySchema,
  taxAmount: moneySchema.nullable(),
  totalAmount: moneySchema,
  vatMode: z.enum(['inclusive', 'exclusive', 'zero']),
  vatRatePercent: z.number().nullable(),
  lines: z.array(lineItemSchema),
  issuer: partySnapshotSchema.nullable(),
  customer: partySnapshotSchema.nullable(),
  issueDate: z.string().min(1),
  dueDate: z.string().nullable(),
  notes: z.string().max(4000).nullable(),
  externalReference: z.string().min(8).max(128),
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
  /** Internal billing credit note (kind credit_note, voids the original invoice). */
  creditNoteBillingRecordId: z.string().uuid().optional(),
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

export type RequestExternalDocumentInput = {
  billing: BillingRecordBridgeRef;
  kind?: (typeof EXTERNAL_DOCUMENT_KINDS)[number];
  idempotencyKey: string;
};
export type RefreshExternalStatusInput = z.infer<typeof refreshExternalStatusSchema>;
export type CreditExternalDocumentInput = z.infer<typeof creditExternalDocumentSchema>;
export type CancelExternalDocumentInput = z.infer<typeof cancelExternalDocumentSchema>;
export type AllocateExternalReferenceInput = z.infer<typeof allocateExternalReferenceSchema>;
export type ListExternalDocumentsInput = z.infer<typeof listExternalDocumentsSchema>;
