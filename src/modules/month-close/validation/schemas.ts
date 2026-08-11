import { z } from 'zod';
import { MONTH_CLOSE_ADJUSTMENT_TYPES } from '../domain/types';

const yearMonthSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');

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

export const createAdjustmentSchema = z.object({
  periodId: z.string().uuid(),
  adjustmentType: z.enum(MONTH_CLOSE_ADJUSTMENT_TYPES).default('correction'),
  reason: z.string().trim().min(1).max(2000),
  entityType: z.string().trim().min(1).max(80).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
});

export const listPeriodsSchema = z.object({
  limit: z.number().int().min(1).max(36).optional(),
});

export type EnsurePeriodInput = z.infer<typeof ensurePeriodSchema>;
export type MarkReadyInput = z.infer<typeof markReadySchema>;
export type ClosePeriodInput = z.infer<typeof closePeriodSchema>;
export type DemoteToOpenInput = z.infer<typeof demoteToOpenSchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type ListPeriodsInput = z.infer<typeof listPeriodsSchema>;
