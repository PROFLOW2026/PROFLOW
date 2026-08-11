import { z } from 'zod';

export const globalSearchSchema = z.object({
  query: z.string().trim().min(2).max(120),
  limitPerKind: z.number().int().min(1).max(10).optional().default(5),
});

export type GlobalSearchInput = z.input<typeof globalSearchSchema>;
