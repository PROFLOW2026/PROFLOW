/**
 * Quick Create — fixed Owner-curated menu (fixed order).
 * Persona/business profile must not add, remove, or reorder Quick Create actions.
 */

import type { ExperiencePersonaKey } from './experience-persona';

/** Owner-approved Quick Create destinations — order is product contract. */
export const CANONICAL_QUICK_CREATE_KEYS = [
  'quickCapture',
  'project',
  'job',
  'service',
  'task',
  'quote',
  'client',
  'expense',
  'vendor',
  'billingRecord',
  'employee',
  'timeEntry',
  'fieldLog',
  'change',
] as const;

export type CanonicalQuickCreateKey = (typeof CANONICAL_QUICK_CREATE_KEYS)[number];

/**
 * @deprecated Persona no longer defines Quick Create contents. Kept for settings/docs references only.
 */
export const PERSONA_QUICK_CREATE_KEYS: Readonly<
  Record<ExperiencePersonaKey, readonly CanonicalQuickCreateKey[]>
> = {
  project_contractor: CANONICAL_QUICK_CREATE_KEYS,
  electrical: CANONICAL_QUICK_CREATE_KEYS,
  renovation: CANONICAL_QUICK_CREATE_KEYS,
  small_works: CANONICAL_QUICK_CREATE_KEYS,
  service: CANONICAL_QUICK_CREATE_KEYS,
  architecture: CANONICAL_QUICK_CREATE_KEYS,
  consulting: CANONICAL_QUICK_CREATE_KEYS,
  inspection: CANONICAL_QUICK_CREATE_KEYS,
  mixed: CANONICAL_QUICK_CREATE_KEYS,
  all: CANONICAL_QUICK_CREATE_KEYS,
};

/** Keep only canonical Quick Create keys in the fixed Owner order. */
export function orderCanonicalQuickCreateActions<T extends { key: string }>(
  actions: readonly T[],
): T[] {
  const byKey = new Map(actions.map((action) => [action.key, action]));
  return CANONICAL_QUICK_CREATE_KEYS.flatMap((key) => {
    const action = byKey.get(key);
    return action ? [action] : [];
  });
}

/**
 * Persona is ignored — returns the canonical subset/order only.
 * Permission/module gating happens before this filter in `buildQuickCreateActions`.
 */
export function limitQuickCreateForPersona<T extends { key: string }>(
  actions: readonly T[],
  _persona: ExperiencePersonaKey,
): T[] {
  return orderCanonicalQuickCreateActions(actions);
}
