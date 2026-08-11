import { z } from 'zod';
import { DRAFT_FREQUENCIES, DRAFT_KINDS, DRAFT_STATUSES } from '../domain/types';

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const moneyString = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const expenseDraftPayloadSchema = z.object({
  amount: moneyString,
  currency: currencySchema,
  description: z.string().trim().max(2000).nullable().optional(),
  supplierName: z.string().trim().max(500).nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  costFamily: z
    .enum(['direct_project', 'shared', 'business_overhead', 'asset_capital'])
    .nullable()
    .optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
});

export const vendorBillDraftPayloadSchema = z.object({
  vendorId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  reference: z.string().trim().max(80).nullable().optional(),
  currency: currencySchema,
  totalAmount: moneyString,
  notes: z.string().trim().max(2000).nullable().optional(),
  dueDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        quantity: moneyString.default('1'),
        unitAmount: moneyString,
        lineTotal: moneyString,
        currency: currencySchema,
      }),
    )
    .min(1),
});

export const billingRecordDraftPayloadSchema = z
  .object({
    projectId: z.string().uuid(),
    amount: moneyString,
    currency: currencySchema.optional(),
    reference: z.string().trim().max(120).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
    dueDays: z.coerce.number().int().min(0).max(365).nullable().optional(),
    finalize: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.finalize === true) {
      ctx.addIssue({
        code: 'custom',
        path: ['finalize'],
        message: 'Recurring templates cannot auto-finalize billing',
      });
    }
  });

export const draftPayloadByKindSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expense'), data: expenseDraftPayloadSchema }),
  z.object({ kind: z.literal('vendor_bill'), data: vendorBillDraftPayloadSchema }),
  z.object({ kind: z.literal('billing_record'), data: billingRecordDraftPayloadSchema }),
]);

const scheduleFields = {
  title: z.string().trim().min(1).max(200),
  frequency: z.enum(DRAFT_FREQUENCIES),
  intervalCount: z.coerce.number().int().min(1).max(52).default(1),
  nextRunDate: businessDateSchema,
  endDate: businessDateSchema.nullable().optional(),
};

function refineDateRange(
  data: { nextRunDate: string; endDate?: string | null },
  ctx: z.RefinementCtx,
): void {
  if (data.endDate && data.endDate < data.nextRunDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'End date cannot be before the next generation date',
    });
  }
}

export const createRecurringDraftSchema = z
  .object({
    draftKind: z.enum(DRAFT_KINDS),
    ...scheduleFields,
    payload: z.unknown(),
  })
  .superRefine(refineDateRange);

export const updateRecurringDraftSchema = z
  .object({
    draftId: z.string().uuid(),
    ...scheduleFields,
    payload: z.unknown(),
  })
  .superRefine(refineDateRange);

export const recurringDraftIdSchema = z.object({
  draftId: z.string().uuid(),
});

export const generateRecurringDraftSchema = z.object({
  draftId: z.string().uuid(),
});

export const listRecurringDraftsSchema = z.object({
  kind: z.enum(DRAFT_KINDS).optional(),
  status: z.enum(DRAFT_STATUSES).optional(),
  includeEnded: z.boolean().optional(),
});

export type CreateRecurringDraftInput = z.input<typeof createRecurringDraftSchema>;
export type UpdateRecurringDraftInput = z.input<typeof updateRecurringDraftSchema>;
export type GenerateRecurringDraftInput = z.input<typeof generateRecurringDraftSchema>;
export type ListRecurringDraftsInput = z.input<typeof listRecurringDraftsSchema>;

/** Empty / sentinel form values become null. */
export function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '__none__') return null;
  return trimmed;
}
