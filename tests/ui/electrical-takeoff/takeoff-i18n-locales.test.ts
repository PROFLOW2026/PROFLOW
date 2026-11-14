import { describe, expect, it } from 'vitest';
import en from '@/locales/en/takeoff.json';
import ar from '@/locales/ar/takeoff.json';
import ru from '@/locales/ru/takeoff.json';
import { flattenLocaleCatalog, readLocaleCatalog } from '../../unit/shared/i18n-catalog-helpers';

const ARABIC_CHAR = /[\u0600-\u06FF]/;
const CYRILLIC_CHAR = /[\u0400-\u04FF]/;
const ICU_PLACEHOLDER = /\{[^}]+\}/g;

function leafStrings(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of leafStrings(value as Record<string, unknown>, path)) out.set(k, v);
    } else if (typeof value === 'string') {
      out.set(path, value);
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return (value.match(ICU_PLACEHOLDER) ?? []).sort();
}

describe('takeoff locale catalogs (ar / ru)', () => {
  const enFlat = leafStrings(en as Record<string, unknown>);
  const arFlat = leafStrings(ar as Record<string, unknown>);
  const ruFlat = leafStrings(ru as Record<string, unknown>);

  it('matches English key set', () => {
    expect([...arFlat.keys()].sort()).toEqual([...enFlat.keys()].sort());
    expect([...ruFlat.keys()].sort()).toEqual([...enFlat.keys()].sort());
  });

  it('keeps ICU placeholders identical to English', () => {
    for (const [key, enVal] of enFlat) {
      expect(placeholders(arFlat.get(key)!), `ar ${key}`).toEqual(placeholders(enVal));
      expect(placeholders(ruFlat.get(key)!), `ru ${key}`).toEqual(placeholders(enVal));
    }
  });

  it('uses Arabic script for user-facing ar strings (except tokens)', () => {
    const skip = /^(source\.|jobStage\.|errors\.|scale\.)/;
    const latinOnly = [...arFlat.entries()].filter(([key, val]) => {
      if (skip.test(key)) return false;
      if (!val.trim()) return false;
      if (/^(PDF|DWG|DXF|Excel|xref|AI|BoQ)/i.test(val)) return false;
      return !ARABIC_CHAR.test(val);
    });
    expect(latinOnly.map(([k]) => k)).toEqual([]);
  });

  it('uses Cyrillic for user-facing ru strings (except tokens)', () => {
    const skip = /^(source\.|jobStage\.|errors\.|scale\.)/;
    const latinOnly = [...ruFlat.entries()].filter(([key, val]) => {
      if (skip.test(key)) return false;
      if (!val.trim()) return false;
      if (/^(PDF|DWG|DXF|Excel|xref|AI|BoQ)/i.test(val)) return false;
      return !CYRILLIC_CHAR.test(val);
    });
    expect(latinOnly.map(([k]) => k)).toEqual([]);
  });

  it('registers in shared locale flatten helper', () => {
    const fromHelper = flattenLocaleCatalog(readLocaleCatalog('ar', 'takeoff'));
    expect(fromHelper.size).toBe(enFlat.size);
  });
});