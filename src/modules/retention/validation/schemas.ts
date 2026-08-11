import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,6})?$/, 'Invalid money amount');

export const releaseRetentionSchema = z.object({
  sourceId: z.string().uuid(),
  amount: moneyString,
  releasedOn: z.string().trim().min(10).max(10),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type ReleaseRetentionInput = z.input<typeof releaseRetentionSchema>;

export const updateDraftRetentionSchema = z.object({
  sourceId: z.string().uuid(),
  retentionAmount: moneyString.optional().nullable(),
  retentionPercent: moneyString.optional().nullable(),
});

export type UpdateDraftRetentionInput = z.input<typeof updateDraftRetentionSchema>;
