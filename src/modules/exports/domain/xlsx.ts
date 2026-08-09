import ExcelJS from 'exceljs';
import type { CsvCell } from './csv';
import type { ExportTable } from './table';

function cellValue(value: CsvCell): string | number | boolean {
  if (value === null || value === undefined) return '';
  return value;
}

/**
 * Build a UTF-8 XLSX workbook (Hebrew-safe). One sheet per table.
 * Does not aggregate across currencies — callers must not mix FX totals.
 */
export async function tablesToXlsx(tables: readonly ExportTable[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProjectFlow';
  workbook.created = new Date();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(table.sheetName));
    sheet.views = [{ state: 'frozen', ySplit: 1, rightToLeft: false }];

    sheet.addRow([...table.headers]);
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };

    for (const row of table.rows) {
      sheet.addRow(row.map(cellValue));
    }

    if (table.notes?.length) {
      sheet.addRow([]);
      for (const note of table.notes) {
        sheet.addRow([note]);
      }
    }

    sheet.columns.forEach((column) => {
      let max = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = String(cell.value ?? '').length;
        if (len > max) max = Math.min(len, 48);
      });
      column.width = max + 2;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function xlsxDownloadHeaders(fileName: string): HeadersInit {
  const safe = fileName.replace(/[^\w.\-]+/g, '_');
  return {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${safe}"`,
    'Cache-Control': 'no-store',
  };
}

function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, '_').trim() || 'Sheet1';
  return cleaned.slice(0, 31);
}

/**
 * Read the first worksheet of an XLSX/XLS buffer into header + string rows
 * for the shared import pipeline (CSV-shaped).
 */
export async function workbookFirstSheetToMatrix(
  data: Buffer | ArrayBuffer | Uint8Array,
): Promise<{ headers: string[]; rows: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  const input =
    data instanceof ArrayBuffer
      ? Buffer.from(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(data);

  await workbook.xlsx.load(input as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { headers: [], rows: [] };
  }

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    const cellCount = Math.max(row.cellCount, 1);
    for (let i = 1; i <= cellCount; i++) {
      const cell = row.getCell(i);
      values.push(stringifyExcelCell(cell.value));
    }
    matrix.push(values);
  });

  if (matrix.length === 0) return { headers: [], rows: [] };
  const headers = matrix[0]!.map((h) => h.trim());
  const rows = matrix.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));
  return { headers, rows };
}

function stringifyExcelCell(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value && value.result !== undefined && value.result !== null) {
      return String(value.result);
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('');
    }
  }
  return String(value);
}
