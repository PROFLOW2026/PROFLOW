import { DEFAULT_LOCALE, MESSAGE_NAMESPACES, type Locale } from './config';

export type Messages = Record<string, Record<string, unknown>>;

/**
 * Loads and merges the namespace catalogs for a locale.
 *
 * Any key missing from a translation falls back to the English canonical entry,
 * so a partially translated namespace shows English text rather than a raw key.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  const [target, fallback] = await Promise.all([
    loadNamespaces(locale),
    locale === 'en' ? Promise.resolve<Messages>({}) : loadNamespaces('en'),
  ]);

  if (locale === 'en') return target;

  const merged: Messages = {};
  for (const namespace of MESSAGE_NAMESPACES) {
    merged[namespace] = deepMerge(fallback[namespace] ?? {}, target[namespace] ?? {});
  }
  return merged;
}

async function loadNamespaces(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    MESSAGE_NAMESPACES.map(async (namespace) => {
      try {
        const imported = (await import(`@/locales/${locale}/${namespace}.json`)) as {
          default: Record<string, unknown>;
        };
        return [namespace, imported.default] as const;
      } catch {
        return [namespace, {}] as const;
      }
    }),
  );

  return Object.fromEntries(entries);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const FALLBACK_LOCALE = DEFAULT_LOCALE;
