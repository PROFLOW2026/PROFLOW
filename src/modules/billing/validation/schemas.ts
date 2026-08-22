import { z } from 'zod';

const moneyAmountSchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal');

const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

export const createBillingRecordSchema = z.object({
  projectId: z.string().uuid('Project is required'),
  contractId: z.string().uuid().nullable().optional(),
  amount: moneyAmountSchema,
  currency: currencySchema.optional(),
  issueDate: businessDateSchema,
  dueDate: businessDateSchema.optional().nullable(),
  /** Optional catalog payment term (kind=payment_term). Suggests dueDate when empty. */
  paymentTermId: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  externalDocumentId: z.string().uuid().optional().nullable(),
  changeOrderIds: z.array(z.string().uuid()).optional(),
  netAmount: moneyAmountSchema.optional().nullable(),
  taxAmount: moneyAmountSchema.optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  retentionAmount: moneyAmountSchema.optional().nullable(),
  retentionPercent: moneyAmountSchema.optional().nullable(),
  finalize: z.boolean().optional(),
  /** Originating module link (e.g. billing_plan cycle). Defaults to manual. */
  sourceKind: z
    .enum(['manual', 'boq_progress', 'work_order', 'retention_release', 'billing_plan'])
    .optional(),
  sourceId: z.string().uuid().optional().nullable(),
});

export type CreateBillingRecordInput = z.infer<typeof createBillingRecordSchema>;

export const updateBillingRecordSchema = createBillingRecordSchema
  .partial()
  .extend({
    billingRecordId: z.string().uuid(),
  })
  .refine((value) => Object.keys(value).length > 1, {
    message: 'At least one field must be updated',
  });

export type UpdateBillingRecordInput = z.infer<typeof updateBillingRecordSchema>;

export const billingRecordIdSchema = z.object({
  billingRecordId: z.string().uuid(),
});

export const createPaymentSchema = z.object({
  billingRecordId: z.string().uuid('Billing record is required'),
  amount: moneyAmountSchema,
  paymentDate: businessDateSchema,
  method: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const recordCustomerPaymentSchema = z.object({
  clientId: z.string().uuid('Client is required'),
  amount: moneyAmountSchema,
  currency: currencySchema,
  paymentDate: businessDateSchema,
  method: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  applications: z.array(
    z.object({
      billingRecordId: z.string().uuid(),
      amount: moneyAmountSchema,
    }),
  ),
});

export type RecordCustomerPaymentInput = z.infer<typeof recordCustomerPaymentSchema>;

export const paymentIdSchema = z.object({
  paymentId: z.string().uuid(),
});

export const listBillingRecordsSchema = z.object({
  filter: z.enum(['all', 'paid', 'outstanding', 'overdue']).optional(),
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  /** Org AR summary/aging may need a large page; UI lists stay modest by default. */
  limit: z.coerce.number().int().min(1).max(5_000).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listPaymentApplicationsSchema = z.object({
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  includeVoided: z.boolean().optional(),
});

export type ListPaymentApplicationsInput = z.infer<typeof listPaymentApplicationsSchema>;

export type ListBillingRecordsInput = z.infer<typeof listBillingRecordsSchema>;

export const createAdjustmentSchema = z.object({
  billingRecordId: z.string().uuid(),
  amount: moneyAmountSchema,
  issueDate: businessDateSchema,
  notes: z.string().trim().max(4000).optional().nullable(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
