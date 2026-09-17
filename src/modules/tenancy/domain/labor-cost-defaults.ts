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
  /** Org default clock-in for manager manual attendance (HH:mm). */
  standardWorkStartTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  /** Org default clock-out for manager manual attendance (HH:mm). */
  standardWorkEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional()
    .default(null),
});

export type LaborCostDefaults = z.infer<typeof laborCostDefaultsSchema>;
export type LaborCostDefaultComponent = z.infer<typeof laborCostDefaultComponentSchema>;

/** Canonical ProjectFlow default: א׳–ה׳ (Sun–Thu). */
export const CANONICAL_WORK_WEEKDAYS: readonly number[] = [0, 1, 2, 3, 4];

/** Backward-compatible manual-attendance defaults when org times are unset. */
export const DEFAULT_STANDARD_WORK_START_TIME = '09:00';
export const DEFAULT_STANDARD_WORK_END_TIME = '17:00';

const WORK_TIME_HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidWorkTimeHHmm(value: string): boolean {
  return WORK_TIME_HH_MM.test(value.trim());
}

export function workTimeToMinutes(value: string): number {
  const match = WORK_TIME_HH_MM.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid work time: ${value}`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeStoredWorkTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return isValidWorkTimeHHmm(trimmed) ? trimmed : null;
}

export function emptyLaborCostDefaults(): LaborCostDefaults {
  return {
    burdenPercent: null,
    components: [],
    standardHoursPerDay: null,
    workingDaysPerMonth: null,
    workWeekdays: null,
    standardWorkStartTime: null,
    standardWorkEndTime: null,
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
    standardWorkStartTime: normalizeStoredWorkTime(parsed.data.standardWorkStartTime),
    standardWorkEndTime: normalizeStoredWorkTime(parsed.data.standardWorkEndTime),
  };
}

export interface OrgStandardWorkTimes {
  readonly start: string;
  readonly end: string;
}

/**
 * Effective org clock-in/out defaults for new manager attendance entries.
 * Uses saved pair only when both are valid same-day times (end after start).
 */
export function resolveOrgStandardWorkTimes(
  defaults:
    | Pick<LaborCostDefaults, 'standardWorkStartTime' | 'standardWorkEndTime'>
    | null
    | undefined,
): OrgStandardWorkTimes {
  const start = defaults?.standardWorkStartTime;
  const end = defaults?.standardWorkEndTime;
  if (
    start &&
    end &&
    isValidWorkTimeHHmm(start) &&
    isValidWorkTimeHHmm(end) &&
    workTimeToMinutes(start) < workTimeToMinutes(end)
  ) {
    return { start, end };
  }
  return {
    start: DEFAULT_STANDARD_WORK_START_TIME,
    end: DEFAULT_STANDARD_WORK_END_TIME,
  };
}

export function resolveOrgStandardWorkStartTime(
  defaults: Pick<LaborCostDefaults, 'standardWorkStartTime' | 'standardWorkEndTime'> | null | undefined,
): string {
  return resolveOrgStandardWorkTimes(defaults).start;
}

export function resolveOrgStandardWorkEndTime(
  defaults: Pick<LaborCostDefaults, 'standardWorkStartTime' | 'standardWorkEndTime'> | null | undefined,
): string {
  return resolveOrgStandardWorkTimes(defaults).end;
}

/** Validate org work-time pair for settings save (no overnight shifts). */
export function parseOrgStandardWorkTimePair(input: {
  readonly start: string;
  readonly end: string;
}):
  | { ok: true; standardWorkStartTime: string | null; standardWorkEndTime: string | null }
  | { ok: false; path: 'standardWorkStartTime' | 'standardWorkEndTime'; message: string } {
  const start = input.start.trim();
  const end = input.end.trim();

  if (start === '' && end === '') {
    return { ok: true, standardWorkStartTime: null, standardWorkEndTime: null };
  }

  if (!start || !end) {
    return {
      ok: false,
      path: !start ? 'standardWorkStartTime' : 'standardWorkEndTime',
      message: 'Both start and end times are required',
    };
  }

  if (!isValidWorkTimeHHmm(start)) {
    return { ok: false, path: 'standardWorkStartTime', message: 'Invalid start time' };
  }
  if (!isValidWorkTimeHHmm(end)) {
    return { ok: false, path: 'standardWorkEndTime', message: 'Invalid end time' };
  }
  if (start === end) {
    return {
      ok: false,
      path: 'standardWorkEndTime',
      message: 'Start and end times must differ',
    };
  }
  if (workTimeToMinutes(end) <= workTimeToMinutes(start)) {
    return {
      ok: false,
      path: 'standardWorkEndTime',
      message: 'End time must be after start time',
    };
  }

  return {
    ok: true,
    standardWorkStartTime: start,
    standardWorkEndTime: end,
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
