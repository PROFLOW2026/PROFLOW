import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';
import {
  isBlankOrTotalBoqRow,
  parseImportDecimal,
} from '@/modules/imports/domain/boq-import-parse';
import { flagBoqItemCodeDuplicates } from '@/modules/imports/domain/duplicates';
import { validateBoqItems, validateMappedRows, rowHasErrors } from '@/modules/imports/validation/validate-rows';
import { maxImportRowsForKind, MAX_IMPORT_ROWS, MAX_IMPORT_ROWS_BOQ } from '@/modules/imports';
import { sliceListWindow, pageCount } from '@/modules/boq/domain/list-window';

describe('BOQ import decimal precision', () => {
  it('derives unit price with Decimal - not JS Number float drift', () => {
    const quantity = '0.1';
    const amount = '0.3';
    const derived = new Decimal(amount).div(new Decimal(quantity)).toFixed(6);
    // Classic IEEE trap: 0.3/0.1 in Number can be 2.999...; Decimal stays exact.
    expect(derived).toBe('3.000000');
    expect(Number(amount) / Number(quantity)).not.toBe(3);
  });

  it('parses fractional import decimals without rounding loss at parse layer', () => {
    expect(parseImportDecimal('0.000001')).toBe('0.000001');
    expect(parseImportDecimal('1234.567890')).toBe('1234.56789');
  });
});

describe('parseImportDecimal', () => {
  it('parses plain decimals', () => {
    expect(parseImportDecimal('12.5')).toBe('12.5');
    expect(parseImportDecimal('100')).toBe('100');
  });

  it('strips currency symbols and spaces', () => {
    expect(parseImportDecimal('₪ 1,234.50')).toBe('1234.5');
    expect(parseImportDecimal('$1,000')).toBe('1000');
    expect(parseImportDecimal('ILS 90.00')).toBe('90');
  });

  it('handles European decimal commas', () => {
    expect(parseImportDecimal('1.234,56')).toBe('1234.56');
    expect(parseImportDecimal('1234,5')).toBe('1234.5');
  });

  it('handles parentheses negatives', () => {
    expect(parseImportDecimal('(12.50)')).toBe('-12.5');
  });

  it('returns null for garbage', () => {
    expect(parseImportDecimal('abc')).toBeNull();
    expect(parseImportDecimal('')).toBeNull();
    expect(parseImportDecimal(null)).toBeNull();
  });
});

describe('blank/total BOQ rows', () => {
  it('detects empty rows', () => {
    expect(
      isBlankOrTotalBoqRow({
        itemCode: '',
        description: '',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: '',
        chapter: '',
        subchapter: '',
      }),
    ).toBe(true);
  });

  it('detects total / סהכ rows', () => {
    expect(
      isBlankOrTotalBoqRow({
        itemCode: '',
        description: 'TOTAL',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: '999',
        chapter: '',
        subchapter: '',
      }),
    ).toBe(true);
    expect(
      isBlankOrTotalBoqRow({
        itemCode: '',
        description: 'סה״כ',
        unit: '',
        quantity: '',
        unitPrice: '',
        amount: '10',
        chapter: '',
        subchapter: '',
      }),
    ).toBe(true);
  });

  it('keeps normal item rows', () => {
    expect(
      isBlankOrTotalBoqRow({
        itemCode: '01.01',
        description: 'Excavation',
        unit: 'm3',
        quantity: '10',
        unitPrice: '5',
        amount: '50',
        chapter: 'Earth',
        subchapter: '',
      }),
    ).toBe(false);
  });
});

describe('validateBoqItems', () => {
  it('accepts currency-formatted qty/price', () => {
    const issues = validateBoqItems({
      itemCode: 'A1',
      description: 'Cable tray',
      unit: 'm',
      quantity: '1,200.5',
      unitPrice: '₪ 45.00',
      amount: '54022.5',
      chapter: 'MEP',
      subchapter: 'Electrical',
    });
    expect(issues.some((i) => i.severity === 'error')).toBe(false);
  });

  it('errors on unparseable quantity', () => {
    const issues = validateBoqItems({
      description: 'Item',
      quantity: 'n/a',
      unitPrice: '10',
    });
    expect(issues.some((i) => i.field === 'quantity' && i.severity === 'error')).toBe(true);
  });

  it('warns and skips blank/total without required errors', () => {
    const rows = validateMappedRows('boq_items', [
      { rowNumber: 2, values: { description: 'TOTAL', amount: '100' } },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(false);
    expect(rows[0]!.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('flags duplicate item codes as errors', () => {
    const rows = flagBoqItemCodeDuplicates(
      validateMappedRows('boq_items', [
        {
          rowNumber: 2,
          values: { itemCode: '01', description: 'A', quantity: '1', unitPrice: '1' },
        },
        {
          rowNumber: 3,
          values: { itemCode: '01', description: 'B', quantity: '1', unitPrice: '1' },
        },
      ]),
    );
    expect(rowHasErrors(rows[1]!)).toBe(true);
    expect(rows[1]!.issues.some((i) => i.field === 'itemCode')).toBe(true);
  });
});

describe('boq import row limits', () => {
  it('raises the cap for boq_items only', () => {
    expect(MAX_IMPORT_ROWS).toBe(500);
    expect(MAX_IMPORT_ROWS_BOQ).toBeGreaterThanOrEqual(2000);
    expect(maxImportRowsForKind('boq_items')).toBe(MAX_IMPORT_ROWS_BOQ);
    expect(maxImportRowsForKind('clients')).toBe(MAX_IMPORT_ROWS);
  });
});

describe('list-window helpers', () => {
  it('slices pages for large lists', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const page = sliceListWindow(items, 100, 50);
    expect(page.items).toEqual(items.slice(100, 150));
    expect(page.hasMore).toBe(true);
    expect(pageCount(1000, 50)).toBe(20);
  });
});
