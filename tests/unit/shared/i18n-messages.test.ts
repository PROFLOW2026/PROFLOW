import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOCALES, MESSAGE_NAMESPACES, type Locale } from '@/shared/i18n/config';

/**
 * Guards the message catalogs while several workstreams edit them in parallel.
 *
 * English is canonical, Hebrew is the first complete UI, so any key present in
 * one must exist in the other with the same ICU placeholders. A mismatch here
 * shows up in production as an untranslated key or a broken interpolation.
 */

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');

type Catalog = Record<string, unknown>;

function readCatalog(locale: Locale, namespace: string): Catalog {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  } catch {
    return {};
  }
}

function flatten(value: Catalog, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      for (const [nested, nestedValue] of flatten(entry as Catalog, path)) {
        result.set(nested, nestedValue);
      }
    } else {
      result.set(path, String(entry));
    }
  }
  return result;
}

/** `{name}` and `{count, plural, ...}` both resolve to the argument `name`/`count`. */
function placeholders(message: string): Set<string> {
  const found = new Set<string>();
  for (const match of message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) {
    found.add(match[1]!);
  }
  return found;
}

describe('message catalogs', () => {
  const populated = MESSAGE_NAMESPACES.filter((namespace) =>
    LOCALES.every((locale) => flatten(readCatalog(locale, namespace)).size > 0),
  );

  it('has at least the Lead-owned namespaces populated in both locales', () => {
    for (const namespace of ['common', 'nav', 'errors', 'financial', 'status', 'validation']) {
      expect(populated).toContain(namespace);
    }
  });

  it.each(populated)('%s has identical keys in every locale', (namespace) => {
    const english = flatten(readCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flatten(readCatalog(locale, namespace));

      const missing = [...english.keys()].filter((key) => !translated.has(key));
      const extra = [...translated.keys()].filter((key) => !english.has(key));

      expect({ namespace, locale, missing }).toEqual({ namespace, locale, missing: [] });
      expect({ namespace, locale, extra }).toEqual({ namespace, locale, extra: [] });
    }
  });

  it.each(populated)('%s uses the same ICU arguments in every locale', (namespace) => {
    const english = flatten(readCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flatten(readCatalog(locale, namespace));

      for (const [key, message] of english) {
        const other = translated.get(key);
        if (other === undefined) continue;
        expect({ key, args: [...placeholders(other)].sort() }).toEqual({
          key,
          args: [...placeholders(message)].sort(),
        });
      }
    }
  });

  it.each(populated)('%s has no blank message in any locale', (namespace) => {
    for (const locale of LOCALES) {
      const blank = [...flatten(readCatalog(locale, namespace))]
        .filter(([, message]) => message.trim() === '')
        .map(([key]) => key);
      expect({ locale, blank }).toEqual({ locale, blank: [] });
    }
  });

  it('never shows the internal term "WorkPackage" in the Hebrew UI', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      for (const [key, message] of flatten(readCatalog('he-IL', namespace))) {
        expect({ namespace, key, containsWorkPackage: /workpackage/i.test(message) }).toEqual({
          namespace,
          key,
          containsWorkPackage: false,
        });
      }
    }
  });
});
