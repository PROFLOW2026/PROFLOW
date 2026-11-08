import {
  DEFAULT_STYLE_PREFERENCE,
  isEnabledStyle,
  STYLE_AUTH_METADATA_KEY,
  type StylePreference,
} from './config';

export function styleFromAuthMetadata(
  metadata: Record<string, unknown> | null | undefined,
): StylePreference | null {
  const value = metadata?.[STYLE_AUTH_METADATA_KEY];
  return isEnabledStyle(value) ? value : null;
}

/** First enabled candidate wins. Invalid metadata does not block the cookie. */
export function resolveStylePreference(
  candidates: Array<string | null | undefined>,
): StylePreference {
  for (const candidate of candidates) {
    if (isEnabledStyle(candidate)) return candidate;
  }
  return DEFAULT_STYLE_PREFERENCE;
}