import { z } from 'zod';
import {
  COMMAND_CENTER_ITEM_STATES,
  COMMAND_CENTER_SOURCE_TYPES,
} from '../domain/types';

export const updateCommandCenterItemStateSchema = z
  .object({
    itemKey: z.string().trim().min(1).max(200),
    sourceType: z.enum(COMMAND_CENTER_SOURCE_TYPES),
    sourceId: z.string().trim().min(1).max(80),
    state: z.enum(COMMAND_CENTER_ITEM_STATES),
    snoozeDays: z.number().int().min(1).max(30).optional(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.state === 'snoozed' && !value.snoozeDays) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['snoozeDays'],
        message: 'snoozeDays is required when state is snoozed',
      });
    }
  });

export type UpdateCommandCenterItemStateInput = z.infer<
  typeof updateCommandCenterItemStateSchema
>;
