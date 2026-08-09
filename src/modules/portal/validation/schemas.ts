import { z } from 'zod';
import { CUSTOMER_PORTAL_SCOPES, VENDOR_PORTAL_SCOPES } from '../domain/types';

export const createCustomerGrantSchema = z
  .object({
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().max(120).optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    scopes: z
      .array(z.enum(CUSTOMER_PORTAL_SCOPES))
      .min(1)
      .default(['project.summary']),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.clientId && !data.projectId) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientId'],
        message: 'At least one of clientId or projectId is required',
      });
    }
  });

export type CreateCustomerGrantInput = z.input<typeof createCustomerGrantSchema>;

export const createVendorGrantSchema = z.object({
  email: z.string().trim().email().max(320),
  displayName: z.string().trim().max(120).optional().nullable(),
  vendorId: z.string().uuid(),
  scopes: z
    .array(z.enum(VENDOR_PORTAL_SCOPES))
    .min(1)
    .default(['vendor.summary']),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateVendorGrantInput = z.input<typeof createVendorGrantSchema>;

export const revokeGrantSchema = z.object({
  grantId: z.string().uuid(),
});

export type RevokeGrantInput = z.input<typeof revokeGrantSchema>;

export const customerProjectSummarySchema = z.object({
  projectId: z.string().uuid(),
  grantId: z.string().uuid().optional(),
  scopes: z.array(z.enum(CUSTOMER_PORTAL_SCOPES)).optional(),
});

export type CustomerProjectSummaryInput = z.input<typeof customerProjectSummarySchema>;

export const vendorPortalPreviewSchema = z.object({
  grantId: z.string().uuid(),
});

export type VendorPortalPreviewInput = z.input<typeof vendorPortalPreviewSchema>;

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

const supplierQuoteLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: moneyString.default('1'),
  unitAmount: moneyString,
  lineTotal: moneyString,
  currency: z.string().trim().length(3),
});

export const submitVendorQuoteCandidateSchema = z.object({
  grantId: z.string().uuid(),
  vendorId: z.string().uuid(),
  rfqId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
  receivedOn: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(supplierQuoteLineSchema).min(1),
});

export type SubmitVendorQuoteCandidateInput = z.input<typeof submitVendorQuoteCandidateSchema>;

/** Admin records a vendor quote on behalf (public login still foundation-only). */
export const recordVendorQuoteOnBehalfSchema = z.object({
  vendorId: z.string().uuid(),
  rfqId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
  receivedOn: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(supplierQuoteLineSchema).min(1),
});

export type RecordVendorQuoteOnBehalfInput = z.input<typeof recordVendorQuoteOnBehalfSchema>;

const billCandidateLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: moneyString.default('1'),
  unitAmount: moneyString,
  lineTotal: moneyString,
});

export const submitVendorApBillCandidateSchema = z.object({
  grantId: z.string().uuid(),
  vendorId: z.string().uuid(),
  reference: z.string().trim().max(80).optional().nullable(),
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
  billDate: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(billCandidateLineSchema).min(1),
});

export type SubmitVendorApBillCandidateInput = z.input<typeof submitVendorApBillCandidateSchema>;

export const submitVendorComplianceCandidateSchema = z.object({
  grantId: z.string().uuid(),
  vendorId: z.string().uuid(),
  artifactKind: z.enum(['insurance', 'license', 'certification', 'other']),
  name: z.string().trim().min(1).max(200),
  referenceNumber: z.string().trim().max(120).optional().nullable(),
  expiresOn: z.string().trim().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type SubmitVendorComplianceCandidateInput = z.input<
  typeof submitVendorComplianceCandidateSchema
>;
