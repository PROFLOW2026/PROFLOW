import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { localizeClientTypeName } from '@/modules/business-catalog/domain/client-type-labels';
import { localizePaymentTermName } from '@/modules/business-catalog/domain/payment-term-labels';
import { MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-catalog-helpers';

const RU_DIR = join(process.cwd(), 'src', 'locales', 'ru');
const CYRILLIC = /[\u0400-\u04FF]/;

function looksLikeNaturalRussian(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!CYRILLIC.test(trimmed)) return false;
  if (/^[A-Za-z0-9\s.,'"_\-/+:()]+$/.test(trimmed)) return false;
  return true;
}

describe('Russian runtime acceptance', () => {
  it('every MESSAGE_NAMESPACE has a ru catalog file', () => {
    for (const ns of MESSAGE_NAMESPACES) {
      expect(existsSync(join(RU_DIR, `${ns}.json`)), ns).toBe(true);
    }
  });

  it('localizes client types to Russian (never English catalog names)', () => {
    expect(localizeClientTypeName('private', 'Private', 'ru')).toBe('Частный');
    const label = localizeClientTypeName('company', 'Company', 'ru');
    expect(label).not.toMatch(/^[A-Za-z][A-Za-z /]+$/);
    expect(looksLikeNaturalRussian(label)).toBe(true);
  });

  it('localizes payment terms without English Net/EOM tokens', () => {
    const label = localizePaymentTermName('eom_30', 'EOM + 30', 'ru');
    expect(label).not.toMatch(/\bEOM\b/);
    expect(label).not.toMatch(/\bNet\b/);
    expect(looksLikeNaturalRussian(label)).toBe(true);
  });

  it('settings.stagesPanel intro is natural Russian', () => {
    const settings = flattenLocaleCatalog(readLocaleCatalog('ru', 'settings'));
    const intro = settings.get('stagesPanel.intro');
    expect(intro).toBeTruthy();
    expect(looksLikeNaturalRussian(intro!)).toBe(true);
  });
});
