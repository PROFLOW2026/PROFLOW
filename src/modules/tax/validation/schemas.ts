import { z } from 'zod';
import { businessDate, isBusinessDate } from '@/shared/dates';

export const taxRuleKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9_]+$/, 'Key must use lowercase letters, numbers and underscores');

export const createTaxRuleSchema = z
  .object({
    key: taxRuleKeySchema,
    name: z.string().trim().min(2).max(120),
    method: z.enum(['percentage', 'exempt', 'zero_rated']).default('percentage'),
    ratePercent: z.string().trim().optional().nullable(),
    validFrom: z.string().refine(isBusinessDate, 'Invalid date'),
    validTo: z
      .string()
      .optional()
      .nullable()
      .refine((value) => value === undefined || value === null || value === '' || isBusinessDate(value)),
    isDefault: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.method === 'percentage' && !data.ratePercent?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['ratePercent'], message: 'Rate is required for percentage tax' });
    }
    const from = businessDate(data.validFrom);
    const to = data.validTo?.trim() ? businessDate(data.validTo) : null;
    if (to && to < from) {
      ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'End date must be on or after start date' });
    }
  });

export type CreateTaxRuleInput = z.input<typeof createTaxRuleSchema>;
export type CreateTaxRuleValues = z.output<typeof createTaxRuleSchema>;

export const updateTaxRuleSchema = z
  .object({
    ruleId: z.string().uuid(),
    name: z.string().trim().min(2).max(120).optional(),
    ratePercent: z.string().trim().optional().nullable(),
    validFrom: z
      .string()
      .optional()
      .refine((value) => value === undefined || isBusinessDate(value)),
    validTo: z
      .string()
      .optional()
      .nullable()
      .refine((value) => value === undefined || value === null || value === '' || isBusinessDate(value)),
    isDefault: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.validFrom && data.validTo?.trim()) {
      const from = businessDate(data.validFrom);
      const to = businessDate(data.validTo);
      if (to < from) {
        ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'End date must be on or after start date' });
      }
    }
  });

export type UpdateTaxRuleInput = z.input<typeof updateTaxRuleSchema>;

export const resolveTaxSchema = z.object({
  date: z.string().refine(isBusinessDate, 'Invalid date'),
  key: taxRuleKeySchema.optional(),
});
