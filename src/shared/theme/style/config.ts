/** Visual style axis. Independent of light/dark/system appearance. */
export const STYLE_PREFERENCES = ['classic', 'modern', 'premium'] as const;

export type StylePreference = (typeof STYLE_PREFERENCES)[number];

export const DEFAULT_STYLE_PREFERENCE: StylePreference = 'classic';

export const STYLE_COOKIE_NAME = 'pf-ui-style';

export const STYLE_AUTH_METADATA_KEY = 'ui_style_preference';

/** Kill switch. A style omitted here is treated as Classic. */
export const ENABLED_STYLES: readonly StylePreference[] = ['classic', 'modern', 'premium'];

export function isStylePreference(value: unknown): value is StylePreference {
  return typeof value === 'string' && (STYLE_PREFERENCES as readonly string[]).includes(value);
}

export function isEnabledStyle(value: unknown): value is StylePreference {
  return isStylePreference(value) && ENABLED_STYLES.includes(value);
}

export function normalizeStylePreference(value: unknown): StylePreference {
  return isEnabledStyle(value) ? value : DEFAULT_STYLE_PREFERENCE;
}

export function localStorageStyleKey(userId: string): string {
  return `pf-ui-style:${userId}`;
}