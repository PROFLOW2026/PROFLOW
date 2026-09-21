import { z } from 'zod';

const reminderTypeValues = ['on_due', 'day_before', 'custom'] as const;

export const upsertTaskReminderSchema = z.object({
  reminderType: z.enum(reminderTypeValues),
  remindAt: z.coerce.date().optional(),
  enabled: z.boolean().optional().default(true),
});

export type UpsertTaskReminderInput = z.infer<typeof upsertTaskReminderSchema>;
