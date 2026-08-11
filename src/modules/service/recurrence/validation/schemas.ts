import { z } from 'zod';
import {
  RECURRENCE_DEFINITION_STATUSES,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_PRICING_MODES,
} from '../domain/types';

function emptyToNull(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
);
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalMoney = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/, 'Amount must be a non-negative number')
    .nullable()
    .optional(),
);

const recurrenceDefinitionFields = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  clientId: optionalUuid,
  siteAddress: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  frequency: z.enum(RECURRENCE_FREQUENCIES),
  intervalCount: z.coerce.number().int().min(1).max(365).optional().default(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date is required'),
  endDate: optionalDate,
  defaultDurationMinutes: z.coerce.number().int().min(15).max(24 * 60).nullable().optional(),
  defaultPricingMode: z.preprocess(
    emptyToNull,
    z.enum(RECURRENCE_PRICING_MODES).nullable().optional(),
  ),
  defaultPriceAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  defaultChecklistTemplateId: optionalUuid,
  defaultAssigneeEmployeeId: optionalUuid,
  notes: optionalText,
});

function refineRecurrenceDates(
  value: {
    startDate?: string;
    endDate?: string | null;
    defaultPricingMode?: string | null;
    defaultPriceAmount?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'validation.endBeforeStart',
      path: ['endDate'],
    });
  }
  if (value.defaultPricingMode === 'fixed' && !value.defaultPriceAmount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Price is required for fixed pricing template',
      path: ['defaultPriceAmount'],
    });
  }
}

export const createRecurrenceDefinitionSchema = recurrenceDefinitionFields.superRefine(
  refineRecurrenceDates,
);

export type CreateRecurrenceDefinitionInput = z.input<typeof createRecurrenceDefinitionSchema>;

export const updateRecurrenceDefinitionSchema = recurrenceDefinitionFields
  .partial()
  .extend({
    definitionId: z.string().uuid(),
  })
  .superRefine(refineRecurrenceDates);

export type UpdateRecurrenceDefinitionInput = z.input<typeof updateRecurrenceDefinitionSchema>;

export const recurrenceDefinitionIdSchema = z.object({
  definitionId: z.string().uuid(),
});

export const skipOccurrenceSchema = z.object({
  definitionId: z.string().uuid(),
  occurrenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
});

export type SkipOccurrenceInput = z.input<typeof skipOccurrenceSchema>;

export const generateOccurrencesSchema = z.object({
  definitionId: z.string().uuid(),
  /** Inclusive horizon (YYYY-MM-DD). Defaults to ~30 days ahead when omitted. */
  untilInclusive: optionalDate,
  horizonDays: z.coerce.number().int().min(1).max(366).optional(),
});

export type GenerateOccurrencesInput = z.input<typeof generateOccurrencesSchema>;

export const listRecurrenceDefinitionsSchema = z.object({
  status: z.enum(RECURRENCE_DEFINITION_STATUSES).optional(),
  search: z.preprocess(emptyToNull, z.string().trim().max(200).nullable().optional()),
  includeEnded: z.boolean().optional(),
});

export type ListRecurrenceDefinitionsInput = z.input<typeof listRecurrenceDefinitionsSchema>;
