import { z } from 'zod';

const recurrencePresetValues = ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'custom'] as const;

export const upsertTaskRecurrenceSchema = z.object({
  preset: z.enum(recurrencePresetValues),
  interval: z.coerce.number().int().min(1).max(365).optional().default(1),
  weekday: z.string().max(2).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().nullable().optional(),
  maxOccurrences: z.coerce.number().int().min(1).max(1000).nullable().optional(),
});

export type UpsertTaskRecurrenceInput = z.infer<typeof upsertTaskRecurrenceSchema>;
