import { z } from 'zod';
import { validateCollectionFollowUp } from '../domain/collection-follow-up';

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

const billingRecordFieldsSchema = z.object({
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
  /** Owner VAT entry mode — same values as expenses (inclusive / exclusive / zero). */
  vatMode: z.enum(['inclusive', 'exclusive', 'zero']).optional().nullable(),
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

function requireVatModeWhenFinalizing(
  value: { finalize?: boolean; vatMode?: 'inclusive' | 'exclusive' | 'zero' | null; netAmount?: string | null; taxAmount?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (!value.finalize) return;
  const hasExplicitVatMode = value.vatMode != null;
  const hasManualNetTax = Boolean(value.netAmount?.trim()) && Boolean(value.taxAmount?.trim());
  if (!hasExplicitVatMode && !hasManualNetTax) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vatMode'],
      message: 'VAT mode is required when finalizing a billing record',
    });
  }
}

export const createBillingRecordSchema = billingRecordFieldsSchema.superRefine(requireVatModeWhenFinalizing);

export type CreateBillingRecordInput = z.infer<typeof createBillingRecordSchema>;

export const updateBillingRecordSchema = billingRecordFieldsSchema
  .partial()
  .extend({
    billingRecordId: z.string().uuid(),
  })
  .refine((value) => Object.keys(value).length > 1, {
    message: 'At least one field must be updated',
  })
  .superRefine(requireVatModeWhenFinalizing);

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
  /** Empty = standalone cash on account (unallocated receipt). */
  applications: z
    .array(
      z.object({
        billingRecordId: z.string().uuid(),
        amount: moneyAmountSchema,
      }),
    )
    .default([]),
});

export type RecordCustomerPaymentInput = z.infer<typeof recordCustomerPaymentSchema>;

export const allocateCustomerPaymentSchema = z.object({
  paymentId: z.string().uuid('Payment is required'),
  applications: z
    .array(
      z.object({
        billingRecordId: z.string().uuid(),
        amount: moneyAmountSchema,
      }),
    )
    .min(1, 'At least one allocation is required'),
});

export type AllocateCustomerPaymentInput = z.infer<typeof allocateCustomerPaymentSchema>;

export const paymentIdSchema = z.object({
  paymentId: z.string().uuid(),
});

export const listBillingRecordsSchema = z.object({
  filter: z.enum(['all', 'paid', 'outstanding', 'overdue', 'mismatch']).optional(),
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
  paymentFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  paymentTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
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

export const updateCollectionFollowUpSchema = z
  .object({
    billingRecordId: z.string().uuid(),
    collectionContactedAt: z.string().nullable().optional(),
    collectionNextFollowUpAt: z.string().nullable().optional(),
    collectionPromiseToPayDate: z.string().nullable().optional(),
    collectionNote: z.string().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const result = validateCollectionFollowUp(value);
    if (result.ok) return;
    for (const issue of result.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [issue.path],
        message: issue.message,
      });
    }
  });

export type UpdateCollectionFollowUpInput = z.infer<typeof updateCollectionFollowUpSchema>;

export const editFinalizedBillingRecordSchema = z
  .object({
    billingRecordId: z.string().uuid(),
    issueDate: businessDateSchema.optional(),
    dueDate: businessDateSchema.nullable().optional(),
    reference: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(4000).optional().nullable(),
    amount: moneyAmountSchema.optional(),
    netAmount: moneyAmountSchema.optional().nullable(),
    taxAmount: moneyAmountSchema.optional().nullable(),
    vatMode: z.enum(['inclusive', 'exclusive', 'zero']).optional().nullable(),
    changeAcknowledged: z.literal(true),
  })
  .refine(
    (value) =>
      value.issueDate !== undefined ||
      value.dueDate !== undefined ||
      value.reference !== undefined ||
      value.notes !== undefined ||
      value.amount !== undefined ||
      value.netAmount !== undefined ||
      value.taxAmount !== undefined ||
      value.vatMode !== undefined,
    { message: 'At least one field must be updated' },
  );

export type EditFinalizedBillingRecordInput = z.infer<typeof editFinalizedBillingRecordSchema>;

export const previewSimilarBillingSchema = z.object({
  billingRecordId: z.string().uuid(),
  issueDate: businessDateSchema,
  subtotalAmount: moneyAmountSchema,
  projectId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
});

export type PreviewSimilarBillingInput = z.infer<typeof previewSimilarBillingSchema>;

export const updateRecordedCustomerPaymentDateSchema = z.object({
  paymentId: z.string().uuid(),
  paymentDate: businessDateSchema,
  changeAcknowledged: z.literal(true),
});

export type UpdateRecordedCustomerPaymentDateInput = z.infer<
  typeof updateRecordedCustomerPaymentDateSchema
>;

export const correctRecordedCustomerPaymentSchema = z
  .object({
    paymentId: z.string().uuid(),
    paymentDate: businessDateSchema.optional(),
    amount: moneyAmountSchema.optional(),
    changeAcknowledged: z.literal(true),
  })
  .refine((value) => value.paymentDate !== undefined || value.amount !== undefined, {
    message: 'At least payment date or amount must be updated',
  });

export type CorrectRecordedCustomerPaymentInput = z.infer<
  typeof correctRecordedCustomerPaymentSchema
>;
