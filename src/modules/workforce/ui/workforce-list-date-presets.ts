/** Owner workforce lists: TODAY / THIS WEEK / THIS MONTH / THIS YEAR (+ collapsed custom). */
export const WORKFORCE_LIST_DATE_PRESETS = [
  'today',
  'thisWeek',
  'thisMonth',
  'thisYear',
] as const;

export type WorkforceListDatePreset = (typeof WORKFORCE_LIST_DATE_PRESETS)[number];
