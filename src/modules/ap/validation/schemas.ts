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
  currency: z.string().trim().length(3),
  totalAmount: moneyString,
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
