/** Product design axis. Independent of classic/modern/premium and of light/dark. */
export const DESIGN_PREFERENCES = ['current', 'v9', 'v10'] as const;

export type DesignPreference = (typeof DESIGN_PREFERENCES)[number];

export const DEFAULT_DESIGN_PREFERENCE: DesignPreference = 'current';

export const DESIGN_COOKIE_NAME = 'pf-ui-design';

export const DESIGN_AUTH_METADATA_KEY = 'ui_design_preference';

/** Kill switch. An omitted design is treated as the current product. */
export const ENABLED_DESIGNS: readonly DesignPreference[] = ['current', 'v9', 'v10'];

export function isDesignPreference(value: unknown): value is DesignPreference {
  return typeof value === 'string' && (DESIGN_PREFERENCES as readonly string[]).includes(value);
}

export function isEnabledDesign(value: unknown): value is DesignPreference {
  return isDesignPreference(value) && ENABLED_DESIGNS.includes(value);
}

export function normalizeDesignPreference(value: unknown): DesignPreference {
  return isEnabledDesign(value) ? value : DEFAULT_DESIGN_PREFERENCE;
}
