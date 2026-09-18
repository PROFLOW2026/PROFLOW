import { z } from 'zod';

export const connectSumitTestSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  /** SUMIT OpenAPI Core_APICredentials.APIKey minLength is 1. */
  apiKey: z.string().min(1).max(512),
});

export type ConnectSumitTestInput = z.infer<typeof connectSumitTestSchema>;
