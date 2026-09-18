import { z } from 'zod';

export const connectSumitTestSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  apiKey: z.string().min(8).max(512),
});

export type ConnectSumitTestInput = z.infer<typeof connectSumitTestSchema>;
