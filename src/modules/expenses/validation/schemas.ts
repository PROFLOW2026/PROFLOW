import { z } from 'zod';

const costFamilySchema = z.enum(['direct_project', 'shared', 'business_overhead', 'asset_capital']);

const expenseVatModeSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (value === 'inclusive' || value === 'including' || value === 'true') return 'inclusive';
  if (value === 'exclusive' || value === 'excluding' || value === 'false') return 'exclusive';
  if (value === 'zero' || value === 'none') return 'zero';
  return value;
}, z.enum(['inclusive', 'exclusive', 'zero']).optional());

/** @deprecated Prefer vatMode */
const amountIncludesTaxSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'including' || value === '1') return true;
  if (value === 'false' || value === 'excluding' || value === '0') return false;
  return value;
}, z.boolean().optional());

const booleanOptionalSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1' || value === 'on') return true;
  if (value === 'false' || value === '0') return false;
  return value;
}, z.boolean().optional());

const allocationMethodSchema = z.enum([
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
]);

const allocationLineSchema = z.object({
  targetType: z.enum(['project', 'overhead']),
  projectId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  costCategoryId: z.string().uuid().nullable().optional(),
  method: allocationMethodSchema,
  amount: z.string().trim().nullable().optional(),
  percent: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0),
  amountBasis: z.enum(['gross', 'net']).optional(),
});

const expenseFieldsSchema = z.object({
  amount: z.string().trim().min(1, 'Amount is required'),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  description: z.string().trim().max(2000).nullable().optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  supplierName: z.string().trim().max(500).nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  phaseId: z.string().uuid().nullable().optional(),
  costFamily: costFamilySchema.nullable().optional(),
  costCategoryId: z.string().uuid().nullable().optional(),
  /**
   * When set, net/tax/gross are derived from the org tax rule via the shared
   * tax engine. Omitted → legacy fast capture (entered = net = gross).
   * Not persisted as its own column - reconstructed from stored amounts on edit.
   */
  amountIncludesTax: amountIncludesTaxSchema,
  vatMode: expenseVatModeSchema,
  netAmount: z.string().trim().nullable().optional(),
  taxAmount: z.string().trim().nullable().optional(),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  recurrenceCadence: z.enum(['one_time', 'monthly', 'quarterly', 'yearly', 'custom']).optional(),
  recurrenceCustomLabel: z.string().trim().max(200).nullable().optional(),
  allocations: z.array(allocationLineSchema).optional(),
  /** Inclusive allocation period for automatic drivers. */
  allocationPeriodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  allocationPeriodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** Preferred driver; weight methods trigger automatic allocation when period is set. */
  allocationDriverMethod: allocationMethodSchema.nullable().optional(),
  /**
   * How source NET is sliced before drivers: one_time (default), monthly, annual, custom.
   * Annual/custom/monthly distribute evenly across overlapping calendar months.
   */
  allocationScheduleMode: z.enum(['one_time', 'monthly', 'annual', 'custom']).nullable().optional(),
  /** Optional project filter for SHARED / explicit eligibility. */
  allocationProjectIds: z.array(z.string().uuid()).optional(),
  /** Managerial Actual spread (1–120). Default 1 = full NET in the start month. */
  installmentCount: z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : value;
    }
    return value;
  }, z.number().int().min(1).max(120).optional()),
  installmentStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  /** When true, NET books to inventory stock — not operating Actual (0069). */
  inventoryStockPurchase: booleanOptionalSchema,
  /** Required when inventoryStockPurchase is true. */
  inventoryItemId: z.string().uuid().nullable().optional(),
  /** Required when inventoryStockPurchase is true. */
  inventoryPurchaseQty: z.string().trim().nullable().optional(),
});

function refineInventoryStockPurchase(
  data: z.infer<typeof expenseFieldsSchema>,
  ctx: z.RefinementCtx,
): void {
  if (!data.inventoryStockPurchase) return;
  if (!data.inventoryItemId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inventoryItemId'],
      message: 'Required for inventory stock purchase',
    });
  }
  const qty = data.inventoryPurchaseQty?.trim();
  if (!qty) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inventoryPurchaseQty'],
      message: 'Required for inventory stock purchase',
    });
  } else {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['inventoryPurchaseQty'],
        message: 'Quantity must be positive',
      });
    }
  }
}

export const createExpenseSchema = expenseFieldsSchema.superRefine(refineInventoryStockPurchase);

export const updateExpenseSchema = expenseFieldsSchema
  .extend({
    expenseId: z.string().uuid(),
  })
  .superRefine(refineInventoryStockPurchase);

export const expenseIdSchema = z.object({
  expenseId: z.string().uuid(),
});

export const createExpenseAdjustmentSchema = expenseFieldsSchema.extend({
  adjustsExpenseId: z.string().uuid(),
  reverseOriginal: z.boolean().optional(),
});

export const expenseAttentionFilterSchema = z.enum([
  'project_allocation',
  'classification',
  'approval',
]);

export const listExpensesSchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  projectId: z.string().uuid().optional(),
  costFamily: costFamilySchema.optional(),
  costCategoryId: z.string().uuid().optional(),
  status: z.enum(['draft', 'finalized', 'void']).optional(),
  attention: expenseAttentionFilterSchema.optional(),
  unallocated: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1'),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const runAllocationSchema = z.object({
  expenseId: z.string().uuid(),
  method: allocationMethodSchema.optional(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectIds: z.array(z.string().uuid()).optional(),
  scheduleMode: z.enum(['one_time', 'monthly', 'annual', 'custom']).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type CreateExpenseAdjustmentInput = z.infer<typeof createExpenseAdjustmentSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;
export type RunAllocationInput = z.infer<typeof runAllocationSchema>;

export function parseAllocationsFromForm(formData: FormData): z.infer<typeof allocationLineSchema>[] {
  const raw = formData.get('allocations');
  if (!raw || typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return z.array(allocationLineSchema).parse(parsed);
  } catch {
    return [];
  }
}
