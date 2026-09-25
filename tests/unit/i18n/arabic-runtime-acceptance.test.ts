import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizeClientTypeName } from '@/modules/business-catalog/domain/client-type-labels';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-catalog-helpers';

const AR_DIR = join(process.cwd(), 'src', 'locales', 'ar');
const ARABIC_CHAR = /[\u0600-\u06FF]/;

function looksLikeNaturalArabic(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!ARABIC_CHAR.test(trimmed)) return false;
  if (/^[A-Za-z0-9\s.,'"_\-/+:()]+$/.test(trimmed)) return false;
  return true;
}

describe('Arabic runtime acceptance', () => {
  it('every MESSAGE_NAMESPACE has an ar catalog file', () => {
    for (const ns of MESSAGE_NAMESPACES) {
      expect(existsSync(join(AR_DIR, `${ns}.json`)), ns).toBe(true);
    }
  });

  it('localizes client types to Arabic (never English catalog names)', () => {
    expect(localizeClientTypeName('private', 'Private', 'ar')).toBe('خاص');
    const label = localizeClientTypeName('company', 'Company', 'ar');
    expect(label).not.toMatch(/^[A-Za-z][A-Za-z /]+$/);
    expect(looksLikeNaturalArabic(label)).toBe(true);
  });

  it('localizes payment terms without English Net/EOM tokens', () => {
    const label = localizePaymentTermName('eom_30', 'EOM + 30', 'ar');
    expect(label).not.toMatch(/\bEOM\b/);
    expect(label).not.toMatch(/\bNet\b/);
    expect(looksLikeNaturalArabic(label)).toBe(true);
  });

  it('settings.stagesPanel intro is natural Arabic', () => {
    const settings = flattenLocaleCatalog(readLocaleCatalog('ar', 'settings'));
    const intro = settings.get('stagesPanel.intro');
    expect(intro).toBeTruthy();
    expect(looksLikeNaturalArabic(intro!)).toBe(true);
  });
});
