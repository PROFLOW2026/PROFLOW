import { describe, expect, it } from 'vitest';
import { flattenLocaleCatalog, readLocaleCatalog } from '../shared/i18n-messages.test';

const GROSS_TITLE_PATTERN_HE = /כולל מע״מ|כולל מעמ|ברוטו|סכום כולל/;
const GROSS_TITLE_PATTERN_EN = /including vat|gross|total due/i;

/** Card / KPI titles paired with NET-primary amounts (gross only in parentheses). */
const NET_PRIMARY_TITLE_KEYS = {
  'he-IL': [
    ['financial', 'kpis.billed'],
    ['financial', 'kpis.paid'],
    ['financial', 'kpis.outstandingNet'],
    ['dashboard', 'businessSummary.outstanding'],
    ['dashboard', 'businessSummary.invoicedThisMonth'],
    ['dashboard', 'businessSummary.collectionsThisMonth'],
    ['financial', 'invoiced'],
    ['clients', 'detail.financial.invoiced'],
  ],
  en: [
    ['financial', 'kpis.billed'],
    ['financial', 'kpis.paid'],
    ['financial', 'kpis.outstandingNet'],
    ['dashboard', 'businessSummary.outstanding'],
    ['dashboard', 'businessSummary.invoicedThisMonth'],
    ['dashboard', 'businessSummary.collectionsThisMonth'],
    ['financial', 'invoiced'],
    ['clients', 'detail.financial.invoiced'],
  ],
} as const;

describe('NET-primary revenue card titles', () => {
  it('he-IL titles do not imply gross when primary amount is NET', () => {
    for (const [namespace, key] of NET_PRIMARY_TITLE_KEYS['he-IL']) {
      const value = flattenLocaleCatalog(readLocaleCatalog('he-IL', namespace)).get(key) ?? '';
      expect(value, `${namespace}.${key}`).not.toMatch(GROSS_TITLE_PATTERN_HE);
    }
  });

  it('en titles do not imply gross when primary amount is NET', () => {
    for (const [namespace, key] of NET_PRIMARY_TITLE_KEYS.en) {
      const value = flattenLocaleCatalog(readLocaleCatalog('en', namespace)).get(key) ?? '';
      expect(value, `${namespace}.${key}`).not.toMatch(GROSS_TITLE_PATTERN_EN);
    }
  });

  it('gross-only labels remain explicit where gross is the primary figure', () => {
    const financial = flattenLocaleCatalog(readLocaleCatalog('he-IL', 'financial'));
    expect(financial.get('kpis.outstanding')).toMatch(/כולל מע״מ/);
    expect(financial.get('kpis.billedGross')).toMatch(/כולל מע״מ/);
  });
});
