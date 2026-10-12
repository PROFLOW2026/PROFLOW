/**
 * Validates column widths and money numFmt on a generated year book XLSX.
 */
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path =
  process.argv[2] ??
  resolve('docs/audits/2026-10-financial-year-book-acceptance/ספר_כספי_2026.xlsx');

const MONEY_FMT = '#,##0.00" ₪"';
const buffer = readFileSync(path);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buffer);

const issues = [];
const MAX_COL_WIDTH = 36;
for (const sheet of wb.worksheets) {
  sheet.columns.forEach((col, index) => {
    const width = col.width ?? 0;
    if (width > MAX_COL_WIDTH && sheet.name !== 'הסבר לקריאה') {
      issues.push(`${sheet.name} col${index + 1} too wide=${width}`);
    }
  });
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === 'number' && cell.numFmt === MONEY_FMT) {
        const col = sheet.getColumn(cell.col);
        if ((col.width ?? 0) < 17) {
          issues.push(`${sheet.name}!${cell.address} width=${col.width}`);
        }
        const rounded = Math.round(cell.value * 100) / 100;
        if (Math.abs(cell.value - rounded) > 1e-9) {
          issues.push(`${sheet.name}!${cell.address} precision=${cell.value}`);
        }
      }
    });
  });
}

const overview = wb.getWorksheet('סקירה שנתית');
const jan = wb.getWorksheet('01 ינואר');
const sample = {
  overviewTitle: overview?.getCell(1, 1).value,
  overviewJanRecognized: overview?.getCell(5, 2).value,
  overviewColumnWidths: [1, 2, 3, 4, 5, 6, 7, 8].map((c) => overview?.getColumn(c).width),
  monthCol1Sample: jan?.getCell(5, 1).value,
  janTitle: jan?.getCell(1, 1).value,
};

console.log(
  JSON.stringify(
    {
      path,
      sheets: wb.worksheets.length,
      issues,
      ok: issues.length === 0,
      sample,
    },
    null,
    2,
  ),
);

if (issues.length > 0) process.exit(1);
