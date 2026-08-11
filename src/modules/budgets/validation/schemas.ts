import { z } from 'zod';
import { BUDGET_LINE_TYPES } from '../domain/types';

const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal');

const optionalMoneyAmountSchema = moneyAmountSchema.optional().nullable();

export const budgetLineInputSchema = z.object({
  lineType: z.enum(BUDGET_LINE_TYPES).default('total'),
  categoryKey: z.string().trim().max(100).optional().nullable(),
  workPackageId: z.string().uuid().optional().nullable(),
  disciplineKey: z.string().trim().max(100).optional().nullable(),
  costCode: z.string().trim().max(100).optional().nullable(),
  label: z.string().trim().min(1).max(200),
  budgetAmount: moneyAmountSchema,
  etcAmount: optionalMoneyAmountSchema,
  sortOrder: z.number().int().min(0).optional(),
});

export type BudgetLineInput = z.infer<typeof budgetLineInputSchema>;

export const createProjectBudgetSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .regex(/^[A-Za-z]{3}$/)
      .optional(),
    /** Lightweight: single total. Ignored when `lines` provided. */
    totalBudgetAmount: optionalMoneyAmountSchema,
    lines: z.array(budgetLineInputSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const hasLines = (value.lines?.length ?? 0) > 0;
    const hasTotal = Boolean(value.totalBudgetAmount);
    if (!hasLines && !hasTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide totalBudgetAmount or lines',
        path: ['totalBudgetAmount'],
      });
    }
  });

export type CreateProjectBudgetInput = z.infer<typeof createProjectBudgetSchema>;

export const reviseProjectBudgetSchema = z
  .object({
    budgetId: z.string().uuid(),
    reason: z.string().trim().min(1).max(2000),
    totalBudgetAmount: optionalMoneyAmountSchema,
    lines: z.array(budgetLineInputSchema).optional(),
  })
  .superRefine((value, ctx) => {
    const hasLines = (value.lines?.length ?? 0) > 0;
    const hasTotal = Boolean(value.totalBudgetAmount);
    if (!hasLines && !hasTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide totalBudgetAmount or lines',
        path: ['totalBudgetAmount'],
      });
    }
  });

export type ReviseProjectBudgetInput = z.infer<typeof reviseProjectBudgetSchema>;
