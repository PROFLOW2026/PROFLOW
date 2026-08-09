import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MESSAGE_NAMESPACES } from '@/shared/i18n/config';

/**
 * Customer-facing locale values must not expose internal/developer wording.
 * Keys may still use domain codes (e.g. permission ids); only string values are checked.
 */

const LOCALES_DIR = join(process.cwd(), 'src', 'locales');
const CUSTOMER_NAMESPACES = MESSAGE_NAMESPACES.filter((ns) => ns !== 'marketing');

type Catalog = Record<string, unknown>;

function flattenLocaleCatalog(value: Catalog, prefix = ''): Map<string, string> {
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

function readLocaleCatalog(locale: string, namespace: string): Catalog {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
}

/** Exact / phrase tokens that must never appear in customer locale values. */
const FORBIDDEN_SUBSTRINGS = [
  'OCR_PROVIDER_API_KEY',
  'StubOcrProvider',
  'user_override',
  'contracts:read',
  'project_profit:read',
  'audit.read',
  'מיגרציה 0011',
  'migration 0011',
  'Migration 0011',
  'portal_kind',
  'vendorId',
  'GET /api/v1',
  'Bearer',
  'Next cookies',
  '.env',
  'Supabase',
] as const;

/** Case-insensitive tokens (clear technical jargon in copy). */
const FORBIDDEN_CASE_INSENSITIVE = ['fixture'] as const;

function collectHits(
  locale: 'he-IL' | 'en',
): Array<{ namespace: string; path: string; token: string; value: string }> {
  const hits: Array<{ namespace: string; path: string; token: string; value: string }> = [];

  for (const namespace of CUSTOMER_NAMESPACES) {
    const flat = flattenLocaleCatalog(readLocaleCatalog(locale, namespace));
    for (const [path, value] of flat) {
      for (const token of FORBIDDEN_SUBSTRINGS) {
        if (value.includes(token)) {
          hits.push({ namespace, path, token, value });
        }
      }
      const lower = value.toLowerCase();
      for (const token of FORBIDDEN_CASE_INSENSITIVE) {
        if (lower.includes(token.toLowerCase())) {
          hits.push({ namespace, path, token, value });
        }
      }
    }
  }

  return hits;
}

describe('no technical leakage in customer locales', () => {
  it('he-IL message values omit forbidden developer substrings', () => {
    const hits = collectHits('he-IL');
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('en message values omit forbidden developer substrings', () => {
    const hits = collectHits('en');
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });
});
