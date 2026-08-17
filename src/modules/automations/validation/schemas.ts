import { z } from 'zod';
import { AUTOMATION_PRESET_KEYS } from '../domain/types';

export const setAutomationRuleSchema = z.object({
  presetKey: z.enum(AUTOMATION_PRESET_KEYS),
  enabled: z.boolean(),
});
export type SetAutomationRuleInput = z.infer<typeof setAutomationRuleSchema>;

export const runAutomationsSchema = z.object({
  presetKey: z.enum(AUTOMATION_PRESET_KEYS).optional(),
});
export type RunAutomationsInput = z.infer<typeof runAutomationsSchema>;
