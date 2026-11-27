import {
  DEFAULT_DESIGN_PREFERENCE,
  DESIGN_AUTH_METADATA_KEY,
  isEnabledDesign,
  type DesignPreference,
} from './config';

export function designFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
): DesignPreference | null {
  const value = metadata?.[DESIGN_AUTH_METADATA_KEY];
  return isEnabledDesign(value) ? value : null;
}

/** First enabled candidate wins. Invalid metadata does not block the cookie. */
export function resolveDesignPreference(
  candidates: Array<string | null | undefined>,
): DesignPreference {
  for (const candidate of candidates) {
    if (isEnabledDesign(candidate)) return candidate;
  }
  return DEFAULT_DESIGN_PREFERENCE;
}
