import { describe, expect, it } from 'vitest';
import { escapeCsvCell, rowsToCsv } from '@/modules/exports/domain/csv';
import {
  enumLabel,
  getExportCopy,
  resolveExportLocale,
  toExcelDate,
  toExcelNumber,
} from '@/modules/exports/domain/export-copy';
import {
  tablesToXlsx,
  workbookFirstDataRowCells,
  workbookFirstDataRowTypes,
  workbookFirstSheetToMatrix,
  workbookSheetViews,
} from '@/modules/exports/domain/xlsx';
import { EXPORT_KINDS } from '@/modules/exports/application/build-csv-export';
import type { ExportTable } from '@/modules/exports/domain/table';

describe('csv helpers', () => {
  it('escapes commas quotes and newlines', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('emits utf-8 bom and crlf rows for excel-friendly hebrew', () => {
    const csv = rowsToCsv(['name', 'amount'], [
      ['פרויקט', '12.50'],
      ['plain', null],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('name,amount\r\n');
    expect(csv).toContain('פרויקט,12.50\r\n');
    expect(csv).toContain('plain,\r\n');
  });
});

describe('xlsx helpers', () => {
  it('round-trips hebrew headers and rows', async () => {
    const buffer = await tablesToXlsx(
      [
        {
          sheetName: 'Clients',
          headers: ['name', 'city'],
          rows: [
            ['פרויקט', 'תל אביב'],
            ['Acme', 'NYC'],
          ],
        },
      ],
      { locale: 'en' },
    );
    expect(buffer.byteLength).toBeGreaterThan(100);

    const matrix = await workbookFirstSheetToMatrix(buffer);
    expect(matrix.headers).toEqual(['name', 'city']);
    expect(matrix.rows[0]).toEqual(['פרויקט', 'תל אביב']);
    expect(matrix.rows[1]).toEqual(['Acme', 'NYC']);
  });

  it('sets RTL sheet view for he-IL and LTR for en', async () => {
    const table: ExportTable = {
      sheetName: 'Test',
      headers: ['a'],
      rows: [['x']],
    };
    const he = await tablesToXlsx([table], { locale: 'he-IL' });
    const en = await tablesToXlsx([table], { locale: 'en' });
    expect(await workbookSheetViews(he)).toEqual([{ name: 'Test', rightToLeft: true }]);
    expect(await workbookSheetViews(en)).toEqual([{ name: 'Test', rightToLeft: false }]);
  });

  it('keeps money and counts numeric and dates as date cells with locale formats', async () => {
    const amount = toExcelNumber('12.50');
    const when = toExcelDate('2026-03-15');
    const bufferHe = await tablesToXlsx(
      [
        {
          sheetName: 'Expenses',
          headers: ['amount', 'count', 'when'],
          rows: [[amount, 3, when]],
        },
      ],
      { locale: 'he-IL' },
    );
    const cellsHe = await workbookFirstDataRowCells(bufferHe);
    expect(cellsHe.map((c) => c.kind)).toEqual(['number', 'number', 'date']);
    expect(cellsHe[0]?.value).toBe(12.5);
    expect(cellsHe[1]?.value).toBe(3);
    expect(cellsHe[0]?.value).not.toBe('12.50');
    expect(cellsHe[2]?.value).toBeInstanceOf(Date);
    expect(cellsHe[2]?.numFmt).toBe('dd/mm/yyyy');

    const bufferEn = await tablesToXlsx(
      [
        {
          sheetName: 'Expenses',
          headers: ['amount', 'when'],
          rows: [[amount, when]],
        },
      ],
      { locale: 'en' },
    );
    const cellsEn = await workbookFirstDataRowCells(bufferEn);
    expect(cellsEn[0]?.kind).toBe('number');
    expect(cellsEn[0]?.value).toBe(12.5);
    expect(cellsEn[1]?.numFmt).toBe('yyyy-mm-dd');
  });

  it('sanitizes illegal worksheet characters and truncates long names', async () => {
    const buffer = await tablesToXlsx(
      [
        {
          sheetName: 'Bad/Name*With?Chars[ok]',
          headers: ['a'],
          rows: [['1']],
        },
        {
          sheetName: 'א'.repeat(40),
          headers: ['b'],
          rows: [['2']],
        },
      ],
      { locale: 'he-IL' },
    );
    const views = await workbookSheetViews(buffer);
    expect(views[0]?.name).toBe('Bad_Name_With_Chars_ok_');
    expect(views[1]?.name.length).toBe(31);
    expect(views.every((v) => v.rightToLeft)).toBe(true);
  });
});

describe('hebrew business export copy', () => {
  const he = getExportCopy('he-IL');
  const en = getExportCopy('en');

  const hebrewBusinessSheets = [
    he.sheets.projects,
    he.sheets.clients,
    he.sheets.vendors,
    he.sheets.expenses,
    he.sheets.billing,
    he.sheets.projectFinancials,
    he.sheets.employees,
    he.sheets.timeEntries,
    he.sheets.payments,
    he.sheets.arOutstanding,
    he.sheets.arAging,
    he.sheets.purchaseOrders,
    he.sheets.apBills,
  ] as const;

  it('uses hebrew sheet names without english residue', () => {
    for (const name of hebrewBusinessSheets) {
      expect(name).toMatch(/[\u0590-\u05FF]/);
      expect(name).not.toMatch(/[A-Za-z]{3,}/);
    }
  });

  it('keeps en/he-IL export catalogs structurally aligned', () => {
    expect(Object.keys(he.sheets).sort()).toEqual(Object.keys(en.sheets).sort());
    expect(Object.keys(he.headers).sort()).toEqual(Object.keys(en.headers).sort());
    expect(Object.keys(he.notes).sort()).toEqual(Object.keys(en.notes).sort());
    expect(Object.keys(he.metrics).sort()).toEqual(Object.keys(en.metrics).sort());
    expect(Object.keys(he.enums).sort()).toEqual(Object.keys(en.enums).sort());
    for (const group of Object.keys(en.enums) as Array<keyof typeof en.enums>) {
      expect(Object.keys(he.enums[group]).sort()).toEqual(Object.keys(en.enums[group]).sort());
    }
  });

  it('localizes business headers and status enums for he-IL', async () => {
    const table: ExportTable = {
      sheetName: he.sheets.projects,
      headers: [
        he.headers.id,
        he.headers.name,
        he.headers.status,
        he.headers.currentContractValue,
      ],
      rows: [
        [
          'proj-1',
          'מגדל',
          enumLabel(he, 'projectStatus', 'active'),
          toExcelNumber('1000.00'),
        ],
      ],
      notes: [he.notes.projectsContract],
    };

    const buffer = await tablesToXlsx([table], { locale: 'he-IL' });
    const matrix = await workbookFirstSheetToMatrix(buffer);
    const views = await workbookSheetViews(buffer);

    expect(views[0]).toEqual({ name: he.sheets.projects, rightToLeft: true });
    expect(matrix.headers).toEqual([
      'מזהה',
      'שם',
      'סטטוס',
      'סכום חוזה נוכחי',
    ]);
    expect(matrix.rows[0]?.[2]).toBe('פעיל');
    expect(matrix.headers.join(' ')).not.toMatch(/\b(status|name|id|Projects)\b/i);
    expect(matrix.rows[0]?.[2]).not.toMatch(/active/i);
    expect(matrix.rows.some((row) => row.some((cell) => /Contract amounts appear/i.test(cell)))).toBe(
      false,
    );
    expect(matrix.rows.some((row) => row.some((cell) => /סכומי חוזה/.test(cell)))).toBe(true);

    const types = await workbookFirstDataRowTypes(buffer);
    expect(types[3]).toBe('number');
    const cells = await workbookFirstDataRowCells(buffer);
    expect(cells[3]?.value).toBe(1000);
  });

  it('builds multi-sheet AR workbook with hebrew names, RTL, and numeric fidelity', async () => {
    const tables: ExportTable[] = [
      {
        sheetName: he.sheets.arOutstanding,
        headers: [
          he.headers.id,
          he.headers.outstandingAmount,
          he.headers.collectionStatus,
        ],
        rows: [
          ['bill-1', toExcelNumber('250.75'), enumLabel(he, 'collectionStatus', 'open')],
        ],
        notes: [he.notes.arCurrency, he.notes.arIntegrity],
      },
      {
        sheetName: he.sheets.arAging,
        headers: [
          he.headers.bucket,
          he.headers.count,
          he.headers.totalOutstanding,
        ],
        rows: [
          [enumLabel(he, 'agingBucket', 'days_1_30'), 2, toExcelNumber('250.75')],
        ],
        notes: [
          he.notes.arAgingRules,
          he.notes.arAgingBase.replace('{currency}', 'ILS'),
          he.notes.arAgingOutstanding,
        ],
      },
    ];

    const buffer = await tablesToXlsx(tables, { locale: 'he-IL' });
    const views = await workbookSheetViews(buffer);
    expect(views).toEqual([
      { name: 'חייבים פתוחים', rightToLeft: true },
      { name: 'הזדקנות חייבים', rightToLeft: true },
    ]);

    const matrix = await workbookFirstSheetToMatrix(buffer);
    expect(matrix.headers).toEqual(['מזהה', 'יתרה לגבייה', 'סטטוס גבייה']);
    expect(matrix.rows[0]?.[2]).toBe('פתוח');
    expect(matrix.headers.join('|')).not.toMatch(/Outstanding|Collection|Status|Aging/i);
    expect(matrix.rows.flat().join('|')).not.toMatch(
      /Aging uses Outstanding|Foreign-currency|VAT is not treated as revenue/i,
    );

    const cells = await workbookFirstDataRowCells(buffer);
    expect(cells[1]?.kind).toBe('number');
    expect(cells[1]?.value).toBe(250.75);
  });

  it('keeps english sheet names and LTR for en regression', async () => {
    const table: ExportTable = {
      sheetName: en.sheets.expenses,
      headers: [en.headers.grossAmount, en.headers.status],
      rows: [[toExcelNumber('42.5'), enumLabel(en, 'expenseStatus', 'finalized')]],
    };
    const buffer = await tablesToXlsx([table], { locale: 'en' });
    const views = await workbookSheetViews(buffer);
    const matrix = await workbookFirstSheetToMatrix(buffer);
    const cells = await workbookFirstDataRowCells(buffer);
    expect(views[0]).toEqual({ name: 'Expenses', rightToLeft: false });
    expect(matrix.headers).toEqual(['Gross amount', 'Status']);
    expect(matrix.rows[0]?.[1]).toBe('Finalized');
    expect(cells[0]?.kind).toBe('number');
    expect(cells[0]?.value).toBe(42.5);
  });

  it('uses hebrew AR aging disclosures without domain english residue', () => {
    expect(he.notes.arAgingRules).toMatch(/[\u0590-\u05FF]/);
    expect(he.notes.arAgingRules).not.toMatch(/Aging uses Outstanding/i);
    expect(en.notes.arAgingRules).toMatch(/Outstanding only/i);
    expect(he.notes.arAgingBase).toContain('{currency}');
  });

  it('covers feedback copy for pending and success', () => {
    expect(he.feedback.preparing).toBe('מכין את הקובץ…');
    expect(he.feedback.ready).toBe('הקובץ מוכן וההורדה החלה');
    expect(en.feedback.preparing).toMatch(/Preparing/i);
    expect(en.feedback.ready).toMatch(/ready/i);
  });

  it('resolves unknown locale to default he-IL', () => {
    expect(resolveExportLocale('fr-FR')).toBe('he-IL');
    expect(resolveExportLocale(null)).toBe('he-IL');
    expect(getExportCopy('nope').sheets.projects).toBe(he.sheets.projects);
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
