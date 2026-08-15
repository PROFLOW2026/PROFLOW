/**
 * Locale configuration (doc 10).
 *
 * English is the canonical key language; Hebrew is the first complete UI.
 * Language and country are independent axes — an Israeli organization can run
 * the English UI, and the country pack still drives tax and currency.
 */

export const LOCALES = ['he-IL', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'he-IL';

export interface LocaleMetadata {
  readonly code: Locale;
  readonly dir: 'rtl' | 'ltr';
  /** Endonym — shown in the language switcher in the language itself. */
  readonly label: string;
  readonly htmlLang: string;
}

export const LOCALE_METADATA: Readonly<Record<Locale, LocaleMetadata>> = {
  'he-IL': { code: 'he-IL', dir: 'rtl', label: 'עברית', htmlLang: 'he' },
  en: { code: 'en', dir: 'ltr', label: 'English', htmlLang: 'en' },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function localeDirection(locale: string): 'rtl' | 'ltr' {
  return isLocale(locale) ? LOCALE_METADATA[locale].dir : 'ltr';
}

export function isRtl(locale: string): boolean {
  return localeDirection(locale) === 'rtl';
}

/**
 * Message namespaces (doc 76 §5).
 *
 * Feature agents own their own namespace file so parallel work does not collide
 * in a single giant catalog. `common`, `nav` and `errors` are Lead-owned.
 */
export const MESSAGE_NAMESPACES = [
  'common',
  'nav',
  'auth',
  'errors',
  'validation',
  'organization',
  'settings',
  'dashboard',
  'financial',
  'status',
  'projects',
  'jobs',
  'service',
  'clients',
  'expenses',
  'changes',
  'billing',
  'vendors',
  'workforce',
  'documents',
  'compliance',
  'tax',
  'onboarding',
  'imports',
  'crm',
  'quotes',
  'portal',
  'search',
  'customFields',
  'api',
  'procurement',
  'fieldOps',
  'assets',
  'ap',
  'offline',
  'banking',
  'planning',
  'invoicingIntegration',
  'exports',
  'marketing',
  'budgets',
  'boq',
  'approvals',
  'monthClose',
  'forms',
  'commandCenter',
  'recurringDrafts',
  'notifications',
  'safety',
  'scheduling',
  'forecast',
  'reports',
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

/**
 * Namespaces serialized to the browser via `NextIntlClientProvider`.
 *
 * Full catalogs remain available to Server Components. Shipping every
 * namespace (~237KB he-IL) dominated soft-nav RSC flights (~250KB sibling).
 * Route layouts that need more nest a provider with `clientMessageNamespaces(...)`.
 */
export const APP_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'nav',
  'errors',
  'validation',
  'status',
  'offline',
  'projects',
  'jobs',
  'service',
  'financial',
  'expenses',
  'changes',
  'billing',
  'documents',
  'workforce',
  'clients',
  'vendors',
  'customFields',
  'exports',
  'budgets',
  'boq',
  'approvals',
  'search',
  'notifications',
  'reports',
] as const satisfies readonly MessageNamespace[];
