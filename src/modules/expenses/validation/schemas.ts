import { z } from 'zod';

const costFamilySchema = z.enum(['direct_project', 'shared', 'business_overhead', 'asset_capital']);

const allocationLineSchema = z.object({
  targetType: z.enum(['project', 'overhead']),
  projectId: z.string().uuid().nullable().optional(),
  workPackageId: z.string().uuid().nullable().optional(),
  costCategoryId: z.string().uuid().nullable().optional(),
  method: z.enum(['manual_amount', 'manual_percent']),
  amount: z.string().trim().nullable().optional(),
  percent: z.string().trim().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  sortOrder: z.number().int().min(0),
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
  netAmount: z.string().trim().nullable().optional(),
  taxAmount: z.string().trim().nullable().optional(),
  paymentMethod: z.string().trim().max(100).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  recurrenceCadence: z.enum(['one_time', 'monthly', 'quarterly', 'yearly', 'custom']).optional(),
  recurrenceCustomLabel: z.string().trim().max(200).nullable().optional(),
  allocations: z.array(allocationLineSchema).optional(),
});

export const createExpenseSchema = expenseFieldsSchema;

export const updateExpenseSchema = expenseFieldsSchema.extend({
  expenseId: z.string().uuid(),
});

export const expenseIdSchema = z.object({
  expenseId: z.string().uuid(),
});

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
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesInput = z.infer<typeof listExpensesSchema>;

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
