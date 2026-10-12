/**
 * Experience presentation (families, dashboard layout, custom UI) is always active.
 * Legacy flag-gated UX has been removed.
 */

export function isExperiencePresentationActive(): boolean {
  return true;
}

/** @deprecated Use {@link isExperiencePresentationActive}. Kept for call-site compatibility. */
export function isExperienceFamilyV2Active(_flag?: string | undefined): boolean {
  return true;
}
