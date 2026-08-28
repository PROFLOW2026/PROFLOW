import { z } from 'zod';
import { AP_BILL_STATUSES, AP_MATCH_STATUSES } from '../domain/matching';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

export const createApBillSchema = z.object({
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(80).optional().nullable(),
  billDate: z.string().trim().optional().nullable(),
  dueDate: z.string().trim().optional().nullable(),
  /** Optional catalog payment term (kind=payment_term). Used to suggest dueDate when empty. */
  paymentTermId: z.string().uuid().optional().nullable(),
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
  amountIncludesTax: z.boolean().optional().nullable(),
  netAmount: moneyString.optional().nullable(),
  taxAmount: moneyString.optional().nullable(),
  /** When true, persist as draft - no Actual, no commitment consumption. */
  asDraft: z.boolean().optional(),
  retentionAmount: moneyString.optional().nullable(),
  retentionPercent: moneyString.optional().nullable(),
  subcontractAgreementId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: moneyString.default('1'),
        unitAmount: moneyString,
        lineTotal: moneyString,
        currency: z.string().trim().length(3),
        purchaseOrderLineId: z.string().uuid().optional().nullable(),
        /** Shared transaction taxonomy (same cost_categories as Expense). */
        costCategoryId: z.string().uuid().optional().nullable(),
        costFamily: z
          .enum(['direct_project', 'shared', 'business_overhead', 'asset_capital'])
          .optional()
          .nullable(),
        economicTargetType: z.enum(['inherit', 'project', 'overhead']).optional(),
        projectId: z.string().uuid().optional().nullable(),
      }),
    )
    .min(1),
});

export type CreateApBillInput = z.input<typeof createApBillSchema>;

export const proposeApMatchSchema = z
  .object({
    apBillId: z.string().uuid(),
    purchaseOrderId: z.string().uuid().optional().nullable(),
    expenseId: z.string().uuid().optional().nullable(),
    matchedAmount: moneyString,
    currency: z.string().trim().length(3),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.purchaseOrderId && !data.expenseId) {
      ctx.addIssue({
        code: 'custom',
        path: ['purchaseOrderId'],
        message: 'At least one of purchaseOrderId or expenseId is required',
      });
    }
  });

export type ProposeApMatchInput = z.input<typeof proposeApMatchSchema>;

export const decideApMatchSchema = z.object({
  matchId: z.string().uuid(),
});

export type DecideApMatchInput = z.input<typeof decideApMatchSchema>;

export const apBillStatusSchema = z.enum(AP_BILL_STATUSES);
export const apMatchStatusSchema = z.enum(AP_MATCH_STATUSES);

export const recordVendorPaymentSchema = z.object({
  vendorId: z.string().uuid().optional().nullable(),
  amount: moneyString,
  currency: z.string().trim().length(3),
  paymentDate: z.string().trim().min(10).max(10),
  method: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  applications: z
    .array(
      z.object({
        apBillId: z.string().uuid(),
        appliedAmount: moneyString,
      }),
    )
    .min(1),
});

export type RecordVendorPaymentInput = z.input<typeof recordVendorPaymentSchema>;

export const voidVendorPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});

export type VoidVendorPaymentInput = z.input<typeof voidVendorPaymentSchema>;

/**
 * Non-financial metadata only. Amount / currency / paymentDate / vendorId are
 * intentionally omitted - correction requires void + new payment.
 */
export const updateVendorPaymentMetadataSchema = z
  .object({
    paymentId: z.string().uuid(),
    method: z.string().trim().max(80).optional().nullable(),
    reference: z.string().trim().max(120).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
  })
  .refine(
    (data) =>
      data.method !== undefined || data.reference !== undefined || data.notes !== undefined,
    { message: 'At least one metadata field is required' },
  );

export type UpdateVendorPaymentMetadataInput = z.input<typeof updateVendorPaymentMetadataSchema>;

const billAllocationMethodSchema = z.enum([
  'manual_amount',
  'manual_percent',
  'active_days',
  'equal_split',
]);

export const billProjectAllocationLineSchema = z.object({
  projectId: z.string().uuid(),
  method: billAllocationMethodSchema.default('manual_amount'),
  amount: moneyString.optional().nullable(),
  percent: moneyString.optional().nullable(),
  days: moneyString.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const saveBillProjectAllocationsSchema = z.object({
  apBillId: z.string().uuid(),
  lines: z.array(billProjectAllocationLineSchema).default([]),
  /** When true, persist as applied (supersedes prior applied). Default: draft. */
  apply: z.boolean().optional().default(false),
});

export type SaveBillProjectAllocationsInput = z.input<typeof saveBillProjectAllocationsSchema>;

export const applyBillProjectAllocationsSchema = z.object({
  apBillId: z.string().uuid(),
});

export type ApplyBillProjectAllocationsInput = z.input<typeof applyBillProjectAllocationsSchema>;

export const voidApBillSchema = z.object({
  billId: z.string().uuid(),
});

export type VoidApBillInput = z.input<typeof voidApBillSchema>;

export const restoreApBillSchema = z.object({
  billId: z.string().uuid(),
});

export type RestoreApBillInput = z.input<typeof restoreApBillSchema>;

const apBillLineEditSchema = z.object({
  lineId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(500),
  quantity: moneyString.default('1'),
  unitAmount: moneyString,
  lineTotal: moneyString,
  currency: z.string().trim().length(3),
  purchaseOrderLineId: z.string().uuid().optional().nullable(),
  costCategoryId: z.string().uuid(),
  costFamily: z
    .enum(['direct_project', 'shared', 'business_overhead', 'asset_capital'])
    .optional()
    .nullable(),
  economicTargetType: z.enum(['inherit', 'project', 'overhead']).optional(),
  projectId: z.string().uuid().optional().nullable(),
});

export const editRecognizedApBillSchema = z.object({
  billId: z.string().uuid(),
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  billDate: z.string().trim().optional().nullable(),
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
  amountIncludesTax: z.boolean().optional().nullable(),
  netAmount: moneyString.optional().nullable(),
  taxAmount: moneyString.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(apBillLineEditSchema).min(1),
});

export type EditRecognizedApBillInput = z.input<typeof editRecognizedApBillSchema>;

export const createVendorCreditSchema = z.object({
  vendorId: z.string().uuid(),
  apBillId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  creditDate: z.string().trim().min(10).max(10),
  currency: z.string().trim().length(3),
  amount: moneyString,
  amountIncludesTax: z.boolean().optional().nullable(),
  netAmount: moneyString.optional().nullable(),
  taxAmount: moneyString.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type CreateVendorCreditInput = z.input<typeof createVendorCreditSchema>;

export const applyVendorCreditSchema = z.object({
  creditId: z.string().uuid(),
  apBillId: z.string().uuid(),
  amount: moneyString,
});

export type ApplyVendorCreditInput = z.input<typeof applyVendorCreditSchema>;

export const updateVendorCreditDraftSchema = z.object({
  creditId: z.string().uuid(),
  reference: z.string().trim().max(120).optional().nullable(),
  creditDate: z.string().trim().min(10).max(10),
  amount: moneyString,
  amountIncludesTax: z.boolean().optional().nullable(),
  netAmount: moneyString.optional().nullable(),
  taxAmount: moneyString.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type UpdateVendorCreditDraftInput = z.input<typeof updateVendorCreditDraftSchema>;

export const voidVendorCreditSchema = z.object({
  creditId: z.string().uuid(),
});

export type VoidVendorCreditInput = z.input<typeof voidVendorCreditSchema>;
