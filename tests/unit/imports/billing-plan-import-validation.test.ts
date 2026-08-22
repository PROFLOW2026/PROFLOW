import { describe, expect, it } from 'vitest';
import { fieldDefsForKind } from '@/modules/imports/domain/field-defs';
import { autoMapColumns } from '@/modules/imports/domain/column-mapping';
import { validateMappedRows } from '@/modules/imports/validation/validate-rows';

describe('billing_plan import mapping validation', () => {
  it('maps Hebrew/English aliases and accepts percent or amount rows', () => {
    const headers = ['סעיף', 'תיאור', 'אחוז_מוסכם', 'תאריך_יעד', 'סוג_שורה'];
    const mapping = autoMapColumns('billing_plan', headers);
    expect(mapping.section).toBe(0);
    expect(mapping.label).toBe(1);
    expect(mapping.agreedPercent).toBe(2);
    expect(mapping.targetDate).toBe(3);
    expect(mapping.lineKind).toBe(4);

    const defs = fieldDefsForKind('billing_plan');
    expect(defs.some((d) => d.key === 'label' && d.required)).toBe(true);

    const rows = validateMappedRows(
      'billing_plan',
      [
        {
          rowNumber: 2,
          values: {
            section: 'Structure',
            label: 'Foundations',
            agreedPercent: '30',
            agreedAmount: '',
            targetDate: '2026-06-01',
            notes: '',
            lineKind: 'percent_of_contract',
          },
        },
        {
          rowNumber: 3,
          values: {
            section: '',
            label: '',
            agreedPercent: '',
            agreedAmount: '',
            targetDate: 'not-a-date',
            notes: '',
            lineKind: 'nope',
          },
        },
      ],
      { locale: 'he-IL' },
    );

    expect(rows[0]!.issues.some((i) => i.severity === 'error')).toBe(false);
    expect(rows[1]!.issues.some((i) => i.field === 'label' && i.severity === 'error')).toBe(true);
    expect(rows[1]!.issues.some((i) => i.field === 'targetDate' && i.severity === 'error')).toBe(
      true,
    );
    expect(rows[1]!.issues.some((i) => i.field === 'lineKind' && i.severity === 'error')).toBe(true);
  });

  it('requires agreedAmount or agreedPercent', () => {
    const rows = validateMappedRows('billing_plan', [
      {
        rowNumber: 2,
        values: {
          label: 'Only label',
          agreedAmount: '',
          agreedPercent: '',
        },
      },
    ]);
    expect(
      rows[0]!.issues.some(
        (i) =>
          i.severity === 'error' &&
          (i.field === 'agreedAmount' || /agreed/i.test(i.message)),
      ),
    ).toBe(true);
  });
});
