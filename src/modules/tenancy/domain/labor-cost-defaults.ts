/**
 * Organization labor cost component defaults (doc 06 / 35).
 * Applied as copies when creating new rate versions - not live-linked.
 */

import { z } from 'zod';

export const LABOR_COST_DEFAULTS_SETTING_KEY = 'labor_cost_defaults';

export const laborCostDefaultComponentSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/i, 'Invalid component key'),
  basis: z.enum(['percent', 'fixed']),
  percent: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
});

export const laborCostDefaultsSchema = z.object({
  burdenPercent: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
  components: z.array(laborCostDefaultComponentSchema).max(20).default([]),
  /** Normal daily work capacity — used for monthly→hourly conversion and overtime warnings. */
  standardHoursPerDay: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
  /** Working days per month for monthly compensation conversion. */
  workingDaysPerMonth: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .nullable()
    .default(null),
});

export type LaborCostDefaults = z.infer<typeof laborCostDefaultsSchema>;
export type LaborCostDefaultComponent = z.infer<typeof laborCostDefaultComponentSchema>;

export function emptyLaborCostDefaults(): LaborCostDefaults {
  return {
    burdenPercent: null,
    components: [],
    standardHoursPerDay: null,
    workingDaysPerMonth: null,
  };
}

export function parseLaborCostDefaults(raw: unknown): LaborCostDefaults {
  const parsed = laborCostDefaultsSchema.safeParse(raw ?? {});
  if (!parsed.success) return emptyLaborCostDefaults();
  return {
    burdenPercent: parsed.data.burdenPercent,
    components: parsed.data.components.map((c) => ({ ...c })),
    standardHoursPerDay: parsed.data.standardHoursPerDay,
    workingDaysPerMonth: parsed.data.workingDaysPerMonth,
  };
}
