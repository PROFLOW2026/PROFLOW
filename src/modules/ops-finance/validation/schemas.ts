import { z } from 'zod';
import { OPS_LINK_PURPOSES, OPS_RECORD_KINDS } from '../domain/types';

const allocationMethodSchema = z.enum([
  'manual_amount',
  'manual_percent',
  'contract_weight',
  'labor_hours_weight',
  'direct_cost_weight',
  'equal_split',
]);

export const createLinkedExpenseSchema = z.object({
  opsRecordKind: z.enum(OPS_RECORD_KINDS),
  opsRecordId: z.string().uuid(),
  amount: z.string().trim().min(1).optional(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((v) => v.toUpperCase())
    .optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  costFamily: z
    .enum(['direct_project', 'shared', 'business_overhead', 'asset_capital'])
    .nullable()
    .optional(),
  projectId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  expenseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
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
  allocationDriverMethod: allocationMethodSchema.nullable().optional(),
  allocationScheduleMode: z.enum(['one_time', 'monthly', 'annual', 'custom']).nullable().optional(),
  allocationProjectIds: z.array(z.string().uuid()).optional(),
  linkPurpose: z.enum(OPS_LINK_PURPOSES).optional(),
  vatMode: z.enum(['inclusive', 'exclusive', 'zero']).optional(),
});

export const opsExpenseLinkLookupSchema = z.object({
  opsRecordKind: z.enum(OPS_RECORD_KINDS),
  opsRecordId: z.string().uuid(),
});

export const finalizeLinkedExpenseSchema = z.object({
  expenseId: z.string().uuid(),
});

export type CreateLinkedExpenseInput = z.infer<typeof createLinkedExpenseSchema>;
export type OpsExpenseLinkLookupInput = z.infer<typeof opsExpenseLinkLookupSchema>;
export type FinalizeLinkedExpenseInput = z.infer<typeof finalizeLinkedExpenseSchema>;
