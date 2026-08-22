import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatMoneyAmountForInput } from '@/components/patterns/money-input';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

const HE_DIR = join(process.cwd(), 'src', 'locales', 'he-IL');

/** Values that look like untranslated next-intl keys (e.g. `assets.usage.hint`). */
export const RAW_I18N_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*\.[a-zA-Z][a-zA-Z0-9_.-]*$/;

const HEBREW_CHAR = /[\u0590-\u05FF]/;

/** Forbidden English UI tokens when they are the entire catalog value. */
const FORBIDDEN_ENGLISH_ENTIRE_VALUES = new Set([
  'Net',
  'EOM',
  'End of month',
  'Upload',
  'Preview',
  'Submit',
  'Dashboard',
  'Billing',
]);

/** Allowed whole-value Latin tokens in he-IL catalogs. */
const ALLOWED_ENTIRE_LATIN = new Set(['ProjectFlow', 'PDF', 'CSV', 'Excel', 'OCR']);

/**
 * Optional allowlist of `namespace.json:dotted.path` for rare intentional dotted values.
 * Keep empty unless a real product string must match the raw-key shape.
 */
const RAW_KEY_VALUE_ALLOWLIST = new Set<string>([]);

function looksLikeNaturalHebrew(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (RAW_I18N_KEY_PATTERN.test(trimmed)) return false;
  if (!HEBREW_CHAR.test(trimmed)) return false;
  // Reject English-only labels that slipped into he-IL.
  if (/^[A-Za-z0-9\s.,'"_\-/+:()]+$/.test(trimmed)) return false;
  return true;
}

function collectStringValues(
  node: unknown,
  path: string,
  out: Array<{ path: string; value: string }>,
) {
  if (typeof node === 'string') {
    out.push({ path, value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectStringValues(item, `${path}[${index}]`, out));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      collectStringValues(value, path ? `${path}.${key}` : key, out);
    }
  }
}

describe('Hebrew runtime acceptance (catalog + payment terms + money)', () => {
  it('every MESSAGE_NAMESPACE has a he-IL catalog file', () => {
    for (const ns of MESSAGE_NAMESPACES) {
      const path = join(HE_DIR, `${ns}.json`);
      expect(existsSync(path), ns).toBe(true);
    }
  });

  it('critical assets.usage.* keys are natural Hebrew (not raw keys)', () => {
    const assets = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'assets'));
    const critical = [
      'usage.panelNote',
      'usage.notActualHint',
      'usage.materialSection',
      'usage.equipmentSection',
      'usage.submitMaterial',
      'usage.submitEquipment',
      'usage.emptyMaterial.title',
      'usage.emptyEquipment.title',
    ] as const;

    for (const key of critical) {
      const value = assets.get(key);
      expect(value, key).toBeTruthy();
      expect(looksLikeNaturalHebrew(value!), key).toBe(true);
      expect(value, key).not.toMatch(/^assets\./);
    }
  });

  it('expenses.errors.allocationAmountRequired is natural Hebrew', () => {
    const expenses = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'expenses'));
    const value = expenses.get('errors.allocationAmountRequired');
    expect(value).toBeTruthy();
    expect(looksLikeNaturalHebrew(value!)).toBe(true);
    expect(value).toBe('יש להזין סכום לכל שורת סכום קבוע.');
    expect(value).not.toMatch(/^expenses\.|^errors\./);
  });

  it('localizes payment terms to שוטף family Hebrew (never Net/EOM English)', () => {
    expect(localizePaymentTermName('immediate', 'Immediate', 'he-IL')).toBe('מיידי');
    expect(localizePaymentTermName('eom', 'End of month', 'he-IL')).toBe('שוטף');
    expect(localizePaymentTermName('eom_30', 'EOM + 30', 'he-IL')).toBe('שוטף + 30');
    expect(localizePaymentTermName('eom_45', 'EOM + 45', 'he-IL')).toBe('שוטף + 45');
    expect(localizePaymentTermName('eom_60', 'EOM + 60', 'he-IL')).toBe('שוטף + 60');
    expect(localizePaymentTermName('eom_90', 'EOM + 90', 'he-IL')).toBe('שוטף + 90');
    expect(localizePaymentTermName('eom_120', 'EOM + 120', 'he-IL')).toBe('שוטף + 120');

    for (const key of [
      'immediate',
      'eom',
      'eom_30',
      'eom_45',
      'eom_60',
      'eom_90',
      'eom_120',
      'net_30',
    ] as const) {
      const label = localizePaymentTermName(key, 'fallback', 'he-IL');
      expect(label, key).not.toMatch(/\bNet\b/);
      expect(label, key).not.toMatch(/\bEOM\b/);
      expect(label, key).not.toMatch(/End of month/i);
    }
  });

  it('rounds storage-scale money for ILS input display', () => {
    expect(formatMoneyAmountForInput('547.457627', 'ILS')).toBe('547.46');
  });

  it('expenses.correction preserves history copy without 52,000 exampleHint', () => {
    const expenses = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'expenses'));
    const catalog = readLocaleCatalog('he-IL', 'expenses') as {
      correction?: Record<string, unknown>;
    };

    expect(catalog.correction).toBeTruthy();
    expect(catalog.correction).not.toHaveProperty('exampleHint');
    expect(expenses.get('correction.exampleHint')).toBeUndefined();

    const subtitle = expenses.get('correction.subtitle');
    const historyHint = expenses.get('correction.historyHint');
    expect(subtitle).toBeTruthy();
    expect(historyHint).toBeTruthy();
    expect(looksLikeNaturalHebrew(subtitle!)).toBe(true);
    expect(looksLikeNaturalHebrew(historyHint!)).toBe(true);
    expect(`${subtitle}\n${historyHint}`).toMatch(/היסטור/);
    expect(`${subtitle}\n${historyHint}`).not.toMatch(/52[,.]?000/);
  });

  it('scans all he-IL catalog values for raw keys and forbidden English UI tokens', () => {
    const rawHits: string[] = [];
    const englishHits: string[] = [];

    for (const file of readdirSync(HE_DIR).filter((name) => name.endsWith('.json'))) {
      const values: Array<{ path: string; value: string }> = [];
      collectStringValues(JSON.parse(readFileSync(join(HE_DIR, file), 'utf8')), '', values);

      for (const { path, value } of values) {
        const trimmed = value.trim();
        const allowKey = `${file}:${path}`;

        if (RAW_I18N_KEY_PATTERN.test(trimmed) && !RAW_KEY_VALUE_ALLOWLIST.has(allowKey)) {
          rawHits.push(`${allowKey} = ${trimmed}`);
        }

        if (FORBIDDEN_ENGLISH_ENTIRE_VALUES.has(trimmed) && !ALLOWED_ENTIRE_LATIN.has(trimmed)) {
          englishHits.push(`${allowKey} = ${trimmed}`);
        }
      }
    }

    expect(rawHits, rawHits.join('\n')).toEqual([]);
    expect(englishHits, englishHits.join('\n')).toEqual([]);
  });
});
