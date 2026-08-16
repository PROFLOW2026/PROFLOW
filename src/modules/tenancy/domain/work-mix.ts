/**
 * Organization work mix - which destinations dominate shell chrome.
 *
 * Stored in `organization_settings` (no migration). Does not change the
 * underlying `projects` entity; Jobs and Projects share one financial engine.
 */

export const WORK_MIX_SETTING_KEY = 'work_mix';

export const WORK_MIXES = ['projects', 'jobs', 'mixed'] as const;
export type WorkMix = (typeof WORK_MIXES)[number];

export const DEFAULT_WORK_MIX: WorkMix = 'projects';

export function isWorkMix(value: unknown): value is WorkMix {
  return typeof value === 'string' && (WORK_MIXES as readonly string[]).includes(value);
}

/** Parse JSON setting value; unknown / missing → default (projects-first). */
export function parseWorkMix(value: unknown): WorkMix {
  if (isWorkMix(value)) return value;
  if (value && typeof value === 'object' && 'mode' in value && isWorkMix((value as { mode: unknown }).mode)) {
    return (value as { mode: WorkMix }).mode;
  }
  return DEFAULT_WORK_MIX;
}

/** Jobs destination should appear for this mix even before first usage. */
export function workMixSurfacesJobs(workMix: WorkMix): boolean {
  return workMix === 'jobs' || workMix === 'mixed';
}

/** Projects should stay primary on mobile for this mix. */
export function workMixProjectsPrimary(workMix: WorkMix): boolean {
  return workMix === 'projects' || workMix === 'mixed';
}

/** Jobs should be primary on mobile for this mix. */
export function workMixJobsPrimary(workMix: WorkMix): boolean {
  return workMix === 'jobs' || workMix === 'mixed';
}
