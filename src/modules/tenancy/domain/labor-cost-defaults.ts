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
  /**
   * Explicit org work week (JS weekday 0=Sun … 6=Sat).
   * null / omitted → ProjectFlow canonical Sunday–Thursday.
   * When Owner saves an explicit list, that list is preserved.
   */
  workWeekdays: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7)
    .nullable()
    .optional()
    .default(null),
});

export type LaborCostDefaults = z.infer<typeof laborCostDefaultsSchema>;
export type LaborCostDefaultComponent = z.infer<typeof laborCostDefaultComponentSchema>;

/** Canonical ProjectFlow default: א׳–ה׳ (Sun–Thu). */
export const CANONICAL_WORK_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];

export function emptyLaborCostDefaults(): LaborCostDefaults {
  return {
    burdenPercent: null,
    components: [],
    standardHoursPerDay: null,
    workingDaysPerMonth: null,
    workWeekdays: null,
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
    workWeekdays: parsed.data.workWeekdays ?? null,
  };
}

/**
 * Resolve effective work weekdays for forms/bulk.
 * Explicit org list wins; otherwise canonical א׳–ה׳.
 */
export function resolveOrgWorkWeekdays(
  defaults: Pick<LaborCostDefaults, 'workWeekdays'> | null | undefined,
): readonly number[] {
  const saved = defaults?.workWeekdays;
  if (saved && saved.length > 0) {
    return [...new Set(saved.filter((day) => day >= 0 && day <= 6))].sort((a, b) => a - b);
  }
  return [...CANONICAL_WORK_WEEKDAYS];
}
