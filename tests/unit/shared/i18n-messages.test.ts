import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIT_ACTION_VALUES } from '@/shared/audit';
import { LOCALES, MESSAGE_NAMESPACES, type Locale } from '@/shared/i18n/config';

/**
 * Guards the message catalogs while several workstreams edit them in parallel.
 *
 * English is canonical, Hebrew is the first complete UI, so any key present in
 * one must exist in the other with the same ICU placeholders. A mismatch here
 * shows up in production as an untranslated key or a broken interpolation.
 *
 * `loadMessages` deep-merges English under he-IL for missing keys - that would
 * silently show English in the Hebrew UI. These tests require he-IL to ship
 * every English key so the merge never becomes the only source of a label.
 */

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
          // Nested arrays are uncommon in catalogs; stringify as a last resort.
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

/**
 * Keys present in English but missing from the target locale.
 * Used by tests and can be imported by other tooling.
 */
export function missingLocaleKeys(
  english: Map<string, string>,
  translated: Map<string, string>,
): string[] {
  return [...english.keys()].filter((key) => !translated.has(key));
}

/**
 * Allowed identical en / he-IL values: brand, LTR technical islands, format
 * examples, and ICU scaffolding that is intentionally language-neutral.
 */
const IDENTICAL_MESSAGE_ALLOWLIST = new Set([
  'common.appName',
  'crm.title',
  'documents.fileSize.bytes',
  'documents.fileSize.kilobytes',
  'documents.fileSize.megabytes',
  'onboarding.countries.IL_latin',
  'projects.workspace.clientLinked',
  'api.scopes.projects.read',
  'api.scopes.clients.read',
  'api.scopes.billing.read',
  'api.scopes.webhooks.manage',
  'api.events.test.ping',
  'api.events.project.created',
  'api.events.project.updated',
  'api.events.client.updated',
  'api.events.billing.invoice.issued',
  'api.events.api.key.revoked',
  'settings.activity.actions._fallback',
  'settings.activity.entities._fallback',
  'marketing.hero.brand',
  'marketing.footer.note',
  // Pure math / formula templates that are language-neutral.
  'dashboard.laborReconciliation.equation',
  // Shared screenshot asset paths (language-neutral).
  'marketing.tour.tabs.0.src',
  'marketing.tour.tabs.1.src',
  'marketing.tour.tabs.2.src',
  'marketing.tour.tabs.3.src',
  'marketing.tour.tabs.4.src',
  'marketing.tour.tabs.5.src',
  'marketing.tour.tabs.6.src',
  // Tour tab ids are code keys, not UI copy.
  'marketing.tour.tabs.0.id',
  'marketing.tour.tabs.1.id',
  'marketing.tour.tabs.2.id',
  'marketing.tour.tabs.3.id',
  'marketing.tour.tabs.4.id',
  'marketing.tour.tabs.5.id',
  'marketing.tour.tabs.6.id',
  // FAQ group ids are code keys, not UI copy.
  'marketing.faq.groups.0.id',
  'marketing.faq.groups.1.id',
  'marketing.faq.groups.2.id',
  'marketing.faq.groups.3.id',
]);

function hasActivityAction(catalog: Catalog, action: string): boolean {
  const actions = catalog.actions;
  if (!actions || typeof actions !== 'object') return false;
  const [entity, verb] = action.split('.');
  if (!entity || !verb) return false;
  const group = (actions as Catalog)[entity];
  if (!group || typeof group !== 'object') return false;
  return typeof (group as Catalog)[verb] === 'string';
}

describe('message catalogs', () => {
  it('ships every MESSAGE_NAMESPACE file for en and he-IL', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      for (const locale of LOCALES) {
        const path = join(LOCALES_DIR, locale, `${namespace}.json`);
        expect({ namespace, locale, exists: existsSync(path) }).toEqual({
          namespace,
          locale,
          exists: true,
        });
        expect(flattenLocaleCatalog(readLocaleCatalog(locale, namespace)).size).toBeGreaterThan(0);
      }
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s has identical keys in every locale', (namespace) => {
    const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));

      const missing = missingLocaleKeys(english, translated);
      const extra = [...translated.keys()].filter((key) => !english.has(key));

      expect({ namespace, locale, missing }).toEqual({ namespace, locale, missing: [] });
      expect({ namespace, locale, extra }).toEqual({ namespace, locale, extra: [] });
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s uses the same ICU arguments in every locale', (namespace) => {
    const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));

    for (const locale of LOCALES) {
      if (locale === 'en') continue;
      const translated = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));

      for (const [key, message] of english) {
        const other = translated.get(key);
        if (other === undefined) continue;
        expect({ key, args: [...localePlaceholders(other)].sort() }).toEqual({
          key,
          args: [...localePlaceholders(message)].sort(),
        });
      }
    }
  });

  it.each([...MESSAGE_NAMESPACES])('%s has no blank message in any locale', (namespace) => {
    for (const locale of LOCALES) {
      const blank = [...flattenLocaleCatalog(readLocaleCatalog(locale, namespace))]
        .filter(([, message]) => message.trim() === '')
        .map(([key]) => key);
      expect({ locale, blank }).toEqual({ locale, blank: [] });
    }
  });

  it('he-IL includes every English key (completeness)', () => {
    const gaps: Array<{ namespace: string; missing: string[] }> = [];
    for (const namespace of MESSAGE_NAMESPACES) {
      const missing = missingLocaleKeys(
        flattenLocaleCatalog(readLocaleCatalog('en', namespace)),
        flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace)),
      );
      if (missing.length > 0) gaps.push({ namespace, missing });
    }
    expect(gaps).toEqual([]);
  });

  it('he-IL does not silently reuse English copy (except allowlisted LTR islands)', () => {
    const residue: Array<{ namespace: string; key: string; value: string }> = [];
    for (const namespace of MESSAGE_NAMESPACES) {
      const english = flattenLocaleCatalog(readLocaleCatalog('en', namespace));
      const hebrew = flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace));
      for (const [key, enValue] of english) {
        const heValue = hebrew.get(key);
        if (heValue === undefined || heValue !== enValue) continue;
        if (!/[A-Za-z]{3,}/.test(enValue)) continue;
        if (/^\{[^}]+\}$/.test(enValue.trim())) continue;
        const dotted = `${namespace}.${key}`;
        if (IDENTICAL_MESSAGE_ALLOWLIST.has(dotted)) continue;
        residue.push({ namespace, key, value: enValue });
      }
    }
    expect(residue).toEqual([]);
  });

  it('settings.activity.actions covers every AUDIT_ACTION value', () => {
    const activity = readLocaleCatalog('en', 'settings').activity as Catalog | undefined;
    const missing = AUDIT_ACTION_VALUES.filter((action) => !hasActivityAction(activity ?? {}, action));
    expect(missing).toEqual([]);
  });

  it('never shows the internal term "WorkPackage" in the Hebrew UI', () => {
    for (const namespace of MESSAGE_NAMESPACES) {
      for (const [key, message] of flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace))) {
        expect({ namespace, key, containsWorkPackage: /workpackage/i.test(message) }).toEqual({
          namespace,
          key,
          containsWorkPackage: false,
        });
      }
    }
  });
});
