import { z } from 'zod';
import { MONTH_CLOSE_ADJUSTMENT_TYPES, MONTH_CLOSE_EFFECT_SIDES } from '../domain/types';

const yearMonthSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

const optionalSignedMoney = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^[+-]?\d+(\.\d{1,6})?$/, 'Amount must be a decimal')
    .nullable()
    .optional(),
);

const optionalCurrency = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Za-z]{3}$/)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
);

const optionalEffectSide = z.preprocess(
  emptyToNull,
  z.enum(MONTH_CLOSE_EFFECT_SIDES).nullable().optional(),
);

export const ensurePeriodSchema = z.object({
  yearMonth: yearMonthSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const periodIdSchema = z.object({
  periodId: z.string().uuid(),
});

export const markReadySchema = z.object({
  periodId: z.string().uuid(),
});

export const closePeriodSchema = z.object({
  periodId: z.string().uuid(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export const demoteToOpenSchema = z.object({
  periodId: z.string().uuid(),
});

export const createAdjustmentSchema = z
  .object({
    periodId: z.string().uuid(),
    adjustmentType: z.enum(MONTH_CLOSE_ADJUSTMENT_TYPES).default('correction'),
    reason: z.string().trim().min(1).max(2000),
    entityType: z.string().trim().min(1).max(80).nullable().optional(),
    entityId: z.string().uuid().nullable().optional(),
    amount: optionalSignedMoney,
    currency: optionalCurrency,
    effectSide: optionalEffectSide,
    projectId: optionalUuid,
    supersedesAdjustmentId: optionalUuid,
  })
  .superRefine((value, ctx) => {
    const hasAmount = value.amount != null;
    const hasCurrency = value.currency != null;
    const hasSide = value.effectSide != null;
    const hasProject = value.projectId != null;
    const anyMoneyField = hasAmount || hasCurrency || hasSide;

    if (anyMoneyField) {
      if (!hasAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['amount'],
          message: 'Amount is required when recording an economic correction',
        });
      }
      if (!hasCurrency) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['currency'],
          message: 'Currency is required when amount is provided',
        });
      }
      if (!hasSide) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['effectSide'],
          message: 'Effect side is required when amount is provided',
        });
      }
      if (!hasProject) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['projectId'],
          message: 'Project is required when amount is provided',
        });
      }
    }

    if (value.adjustmentType === 'supersede' && !value.supersedesAdjustmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['supersedesAdjustmentId'],
        message: 'Choose the economic row this correction supersedes',
      });
    }

    if (value.supersedesAdjustmentId && !hasAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['amount'],
        message: 'Supersede requires an economic amount',
      });
    }
  });

export const listPeriodsSchema = z.object({
  limit: z.number().int().min(1).max(36).optional(),
});

export type EnsurePeriodInput = z.infer<typeof ensurePeriodSchema>;
export type MarkReadyInput = z.infer<typeof markReadySchema>;
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;
export type DemoteToOpenInput = z.infer<typeof demoteToOpenSchema>;
export type CreateAdjustmentInput = z.input<typeof createAdjustmentSchema>;
export type ListPeriodsInput = z.infer<typeof listPeriodsSchema>;
