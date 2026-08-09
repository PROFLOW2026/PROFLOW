import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv } from '@/modules/exports/domain/csv';
import { tablesToXlsx, workbookFirstSheetToMatrix } from '@/modules/exports/domain/xlsx';
import { EXPORT_KINDS } from '@/modules/exports/application/build-csv-export';

describe('csv helpers', () => {
  it('escapes commas quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('emits utf-8 bom and crlf rows for excel-friendly hebrew', () => {
    const csv = rowsToCsv(['name', 'amount'], [['פרויקט', '12.50'], ['plain', null]]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('name,amount\r\n');
    expect(csv).toContain('פרויקט,12.50\r\n');
    expect(csv).toContain('plain,\r\n');
  });
});

describe('xlsx helpers', () => {
  it('round-trips hebrew headers and rows', async () => {
    const buffer = await tablesToXlsx([
      {
        sheetName: 'Clients',
        headers: ['name', 'city'],
        rows: [['פרויקט', 'תל אביב'], ['Acme', 'NYC']],
      },
    ]);
    expect(buffer.byteLength).toBeGreaterThan(100);

    const matrix = await workbookFirstSheetToMatrix(buffer);
    expect(matrix.headers).toEqual(['name', 'city']);
    expect(matrix.rows[0]).toEqual(['פרויקט', 'תל אביב']);
    expect(matrix.rows[1]).toEqual(['Acme', 'NYC']);
  });
});

describe('export kinds coverage', () => {
  it('includes pre-launch business export kinds', () => {
    expect(EXPORT_KINDS).toEqual(
      expect.arrayContaining([
        'projects',
        'project-financials',
        'expenses',
        'clients',
        'vendors',
        'employees',
        'time-entries',
        'billing',
        'payments',
        'receivables-aging',
        'purchase-orders',
        'ap-bills',
        'audit',
      ]),
    );
  });
});
