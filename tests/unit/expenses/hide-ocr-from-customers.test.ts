import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Locale } from '@/shared/i18n/config';

const ROOT = process.cwd();
const LOCALES_DIR = join(ROOT, 'src', 'locales');

type Catalog = Record<string, unknown>;

function flattenLocaleCatalog(value: Catalog, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      for (const [nested, nestedValue] of flattenLocaleCatalog(entry as Catalog, path)) {
        result.set(nested, nestedValue);
      }
    } else {
      result.set(path, String(entry));
    }
  }
  return result;
}

function readLocaleCatalog(locale: Locale, namespace: string): Catalog {
  const path = join(LOCALES_DIR, locale, `${namespace}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Catalog;
}

const CUSTOMER_SURFACE_FILES = [
  'src/app/[locale]/(app)/expenses/page.tsx',
  'src/app/[locale]/(app)/documents/page.tsx',
  'src/components/shell/navigation.ts',
  'src/components/shell/app-shell.tsx',
  'src/components/shell/quick-create.tsx',
] as const;

describe('hide OCR extraction from customers', () => {
  it('expenses, documents, and shell nav do not link to ocr-review', () => {
    for (const relative of CUSTOMER_SURFACE_FILES) {
      const source = readFileSync(join(ROOT, relative), 'utf8');
      expect({ file: relative, hasOcrReview: /ocr-review/.test(source) }).toEqual({
        file: relative,
        hasOcrReview: false,
      });
      expect({ file: relative, hasLachilutz: /לחילוץ/.test(source) }).toEqual({
        file: relative,
        hasLachilutz: false,
      });
    }
  });

  it('expenses page primary action is add-only (no OCR entry)', () => {
    const source = readFileSync(join(ROOT, 'src/app/[locale]/(app)/expenses/page.tsx'), 'utf8');
    expect(source).toMatch(/actions\.add/);
    expect(source).not.toMatch(/receiptPhoto/);
    expect(source).not.toMatch(/OCR_PROVIDER/);
  });

  it('production OCR review route redirects away from stub UI', () => {
    const source = readFileSync(
      join(ROOT, 'src/app/[locale]/(app)/documents/ocr-review/page.tsx'),
      'utf8',
    );
    expect(source).toMatch(/NODE_ENV === ['"]production['"]/);
    expect(source).toMatch(/redirect\(\{\s*href:\s*['"]\/expenses['"]/);
  });

  it('customer locale catalogs omit OCR extraction journey wording and secrets', () => {
    for (const locale of ['he-IL', 'en'] as const) {
      const expenses = flattenLocaleCatalog(readLocaleCatalog(locale, 'expenses'));
      const documents = flattenLocaleCatalog(readLocaleCatalog(locale, 'documents'));

      expect(expenses.has('actions.receiptPhoto')).toBe(false);

      for (const [key, message] of expenses) {
        expect(message).not.toMatch(/לחילוץ|OCR_PROVIDER|ocr-review|\(OCR\)/i);
        void key;
      }

      for (const [key, message] of documents) {
        expect(message).not.toMatch(/OCR_PROVIDER|לחילוץ|\(OCR\)/);
        if (!key.startsWith('ocr.')) {
          expect(message).not.toMatch(/ocr-review/i);
        }
      }
    }
  });

  it('attachment capture/upload use receipt-or-invoice customer wording', () => {
    const he = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'documents'));
    const en = flattenLocaleCatalog(readLocaleCatalog('en', 'documents'));

    expect(he.get('attachments.capture')).toBe('צילום קבלה או חשבונית');
    expect(he.get('attachments.upload')).toBe('צירוף קבלה או חשבונית');
    expect(en.get('attachments.capture')).toBe('Photograph receipt or invoice');
    expect(en.get('attachments.upload')).toBe('Attach receipt or invoice');
  });
});
