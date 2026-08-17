import { z } from 'zod';

export const assistantAskSchema = z.object({
  conversationId: z.string().uuid().optional(),
  question: z.string().trim().min(1).max(4000),
  projectId: z.string().uuid().optional(),
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
