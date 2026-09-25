import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locale } from '@/shared/i18n/config';

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');

type Catalog = Record<string, unknown>;

/** Flatten nested JSON catalogs into dotted paths → message string. */
export function flattenLocaleCatalog(value: Catalog, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(entry)) {
      entry.forEach((item, index) => {
        const itemPath = `${path}.${index}`;
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          for (const [nested, nestedValue] of flattenLocaleCatalog(item as Catalog, itemPath)) {
            result.set(nested, nestedValue);
          }
        } else if (Array.isArray(item)) {
          result.set(itemPath, String(item));
        } else {
          result.set(itemPath, String(item));
        }
      });
    } else if (entry !== null && typeof entry === 'object') {
      for (const [nested, nestedValue] of flattenLocaleCatalog(entry as Catalog, path)) {
        result.set(nested, nestedValue);
      }
    } else {
      result.set(path, String(entry));
    }
  }
  return result;
}

export function readLocaleCatalog(locale: Locale, namespace: string): Catalog {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
  } catch {
    return {};
  }
}

/** `{name}` and `{count, plural, ...}` both resolve to the argument `name`/`count`. */
export function localePlaceholders(message: string): Set<string> {
  const found = new Set<string>();
  for (const match of message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) {
    found.add(match[1]!);
  }
  return found;
}

/** Keys present in English but missing from the target locale. */
export function missingLocaleKeys(
  english: Map<string, string>,
  translated: Map<string, string>,
): string[] {
  return [...english.keys()].filter((key) => !translated.has(key));
}
