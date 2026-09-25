import { DEFAULT_LOCALE, MESSAGE_NAMESPACES, type Locale } from './config';

export type Messages = Record<string, Record<string, unknown>>;

/**
 * Loads namespace catalogs for a locale without merging English under he/ar/ru.
 * Missing keys surface through next-intl fallback (dev marker / em dash) so
 * silent English leaks cannot occur in non-English UI.
 */
const messagesByLocale = new Map<Locale, Promise<Messages>>();

function shouldCacheLoadedMessages(): boolean {
  const appEnv = process.env.APP_ENV;
  return appEnv === 'production' || appEnv === 'preview';
}

/**
 * Catalogs are static per deploy. Cache the merge in preview/production so cold
 * requests in the same isolate do not re-import every namespace. Local dev skips
 * the cache so edited locale JSON is picked up without restarting the dev server.
 */
export async function loadMessages(locale: Locale): Promise<Messages> {
  if (shouldCacheLoadedMessages()) {
    const hit = messagesByLocale.get(locale);
    if (hit) return hit;
  }

  const pending = loadMessagesUncached(locale).catch((error: unknown) => {
    messagesByLocale.delete(locale);
    throw error;
  });
  if (shouldCacheLoadedMessages()) {
    messagesByLocale.set(locale, pending);
  }
  return pending;
}

async function loadMessagesUncached(locale: Locale): Promise<Messages> {
  return loadNamespaces(locale);
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

export const FALLBACK_LOCALE = DEFAULT_LOCALE;
