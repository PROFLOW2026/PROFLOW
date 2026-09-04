import { describe, expect, it } from 'vitest';
import { displayCostCategoryName } from '@/modules/expenses/domain/cost-category-display';
import { displayActualAtomLabel } from '@/modules/financials/domain/actual-atom-display';
import heExpenses from '@/locales/he-IL/expenses.json';

const translate = (key: string) => {
  const match = /^costCategories\.(.+)$/.exec(key);
  if (!match) return key;
  const catalog = heExpenses.costCategories as Record<string, string>;
  return catalog[match[1]!] ?? key;
};

describe('cost category presentation', () => {
  it('maps system keys instead of English stored names', () => {
    expect(
      displayCostCategoryName(
        { key: 'subcontractor', name: 'Subcontractor', isSystem: true },
        translate,
      ),
    ).toBe('קבלן משנה');
    expect(
      displayCostCategoryName(
        { key: 'external_service', name: 'External professional service', isSystem: true },
        translate,
      ),
    ).toBe('שירות חיצוני');
  });

  it('maps raw keys even when isSystem is missing', () => {
    expect(displayCostCategoryName({ key: 'subcontractor', name: 'subcontractor' }, translate)).toBe(
      'קבלן משנה',
    );
  });

  it('keeps a custom Hebrew name', () => {
    expect(displayCostCategoryName({ key: 'custom_paint', name: 'צבע מיוחד' }, translate)).toBe(
      'צבע מיוחד',
    );
  });
});

describe('actual atom presentation', () => {
  const copy = {
    employees: 'עובדים',
    monthClose: 'סגירת חודש',
    unnamed: 'מקור עלות',
    translateCostCategory: translate,
  };

  it('never shows raw category keys or workforce tokens', () => {
    expect(displayActualAtomLabel({ sourceKind: 'labor', label: 'workforce' }, copy)).toBe('עובדים');
    expect(displayActualAtomLabel({ sourceKind: 'month_close', label: 'month_close' }, copy)).toBe(
      'סגירת חודש',
    );
    expect(displayActualAtomLabel({ categoryKey: 'subcontractor', label: 'subcontractor' }, copy)).toBe(
      'קבלן משנה',
    );
    expect(
      displayActualAtomLabel({ categoryKey: 'external_service', label: 'external_service' }, copy),
    ).toBe('שירות חיצוני');
  });

  it('prefers a vendor name over a code', () => {
    expect(
      displayActualAtomLabel(
        { vendorName: 'התותחים', categoryKey: 'subcontractor', label: 'subcontractor' },
        copy,
      ),
    ).toBe('התותחים');
  });

  it('prefers a Hebrew source label over the vendor name', () => {
    expect(
      displayActualAtomLabel(
        { vendorName: 'התותחים', categoryKey: 'subcontractor', label: 'הוצאה — ינואר' },
        copy,
      ),
    ).toBe('הוצאה — ינואר');
  });
});
