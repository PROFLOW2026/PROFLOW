/**
 * Organization project profitability display mode (no migration).
 *
 * Controls how project Actual cost and profit are presented in project UI.
 * Does not change allocations, compose economics, or Company Actual.
 */

export const PROJECT_PROFITABILITY_MODE_SETTING_KEY = 'project_profitability_mode';

export const PROJECT_PROFITABILITY_MODES = ['direct', 'include_general', 'both'] as const;
export type ProjectProfitabilityMode = (typeof PROJECT_PROFITABILITY_MODES)[number];

export const DEFAULT_PROJECT_PROFITABILITY_MODE: ProjectProfitabilityMode = 'direct';

export function isProjectProfitabilityMode(value: unknown): value is ProjectProfitabilityMode {
  return (
    typeof value === 'string' &&
    (PROJECT_PROFITABILITY_MODES as readonly string[]).includes(value)
  );
}

/** Parse JSON setting value; unknown / missing → default (direct). */
export function parseProjectProfitabilityMode(value: unknown): ProjectProfitabilityMode {
  if (isProjectProfitabilityMode(value)) return value;
  if (
    value &&
    typeof value === 'object' &&
    'mode' in value &&
    isProjectProfitabilityMode((value as { mode: unknown }).mode)
  ) {
    return (value as { mode: ProjectProfitabilityMode }).mode;
  }
  return DEFAULT_PROJECT_PROFITABILITY_MODE;
}
