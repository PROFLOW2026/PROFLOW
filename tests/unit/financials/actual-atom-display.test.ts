import { describe, expect, it } from 'vitest';
import { displayActualAtomLabel } from '@/modules/financials/domain/actual-atom-display';
import { localizeCode } from '@/shared/i18n/code-display';

const copy = {
  employees: 'עובדים',
  monthClose: 'סגירת חודש',
  unnamed: 'מקור עלות',
  translateCostCategory: (key: string) => {
    const stripped = key.replace(/^costCategories\./, '');
    return localizeCode('he-IL', stripped);
  },
};

describe('actual atom display', () => {
  it('never returns raw subcontractor or external_service tokens', () => {
    expect(
      displayActualAtomLabel({ label: 'subcontractor', categoryKey: 'subcontractor' }, copy),
    ).toBe('קבלן משנה');
    expect(
      displayActualAtomLabel(
        { label: 'external_service', categoryKey: 'external_service' },
        copy,
      ),
    ).toBe('שירות חיצוני');
    expect(displayActualAtomLabel({ sourceKind: 'month_close', label: 'month_close' }, copy)).toBe(
      'סגירת חודש',
    );
  });
});
