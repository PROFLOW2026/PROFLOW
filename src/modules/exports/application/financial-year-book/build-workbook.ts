import 'server-only';

import ExcelJS from 'exceljs';
import { moneyAmount } from '@/modules/financials/domain/financial-year-book/format';
import { hebrewMonthLabel } from '@/modules/financials/domain/financial-year-book/periods';
import type {
  FinancialYearBookData,
  YearBookMonthData,
  YearBookPaymentRow,
} from '@/modules/financials/domain/financial-year-book/types';
import {
  MONTH_SHEET_COLUMN_WIDTHS,
  OVERVIEW_COLUMN_WIDTHS,
  setColumnWidths,
  writeIntegerCell,
  writeMoneyCell,
  writeSectionTitle,
  writeTextCell,
} from './workbook-layout';

const PAYMENT_COLS = 8;
const RECOGNIZED_COLS = 8;
const EMPLOYER_COLS = 5;
const OVERHEAD_COLS = 2;
const BILLING_COLS = 7;
const SUMMARY_COLS = 2;
const OVERVIEW_COLS = 8;

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E1F2' },
};

const TITLE_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' },
};

function applyRtlSheet(sheet: ExcelJS.Worksheet, freezeRow = 1): void {
  sheet.views = [{ state: 'frozen', ySplit: freezeRow, rightToLeft: true }];
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
  });
}

function styleTitleCell(cell: ExcelJS.Cell): void {
  cell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  cell.fill = TITLE_FILL;
  cell.alignment = { horizontal: 'right', vertical: 'middle', wrapText: true };
}

function writeHeaderCells(sheet: ExcelJS.Worksheet, rowNum: number, headers: readonly string[]): void {
  const row = sheet.getRow(rowNum);
  headers.forEach((header, index) => {
    writeTextCell(row.getCell(index + 1), header, { wrap: true });
  });
  styleHeaderRow(row);
  row.height = 22;
}

function paymentColumns(): string[] {
  return [
    'תאריך',
    'ספק / מוטב',
    'תיאור',
    'פרויקט / חברה',
    'נטו ₪',
    'מע״מ ₪',
    'ברוטו ₪',
    'סטטוס',
  ];
}

function writePaymentTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  title: string,
  rows: readonly YearBookPaymentRow[],
): number {
  let headerRowNum = startRow;
  if (title.trim()) {
    writeSectionTitle(sheet, startRow, title, PAYMENT_COLS);
    headerRowNum = startRow + 1;
  }
  writeHeaderCells(sheet, headerRowNum, paymentColumns());
  let rowNum = headerRowNum + 1;
  if (rows.length === 0) {
    writeTextCell(sheet.getRow(rowNum).getCell(1), 'אין נתונים');
    return rowNum + 2;
  }
  for (const row of rows) {
    const excelRow = sheet.getRow(rowNum);
    writeTextCell(excelRow.getCell(1), row.date);
    writeTextCell(excelRow.getCell(2), row.party);
    writeTextCell(excelRow.getCell(3), row.description, { wrap: true });
    writeTextCell(excelRow.getCell(4), row.project, { wrap: true });
    writeMoneyCell(excelRow.getCell(5), moneyAmount(row.net));
    writeMoneyCell(excelRow.getCell(6), moneyAmount(row.vat));
    writeMoneyCell(excelRow.getCell(7), moneyAmount(row.gross));
    writeTextCell(excelRow.getCell(8), phaseStatusLabel(row.nature));
    if (row.description.length > 36) excelRow.height = 32;
    rowNum += 1;
  }
  return rowNum + 1;
}

function phaseStatusLabel(phase: 'actual' | 'expected'): string {
  return phase === 'expected' ? 'צפוי' : 'בוצע';
}

function writeMonthSheet(workbook: ExcelJS.Workbook, month: YearBookMonthData, year: number): void {
  const sheet = workbook.addWorksheet(month.period.sheetTitle);
  applyRtlSheet(sheet, 1);
  sheet.getCell(1, 1).value = `${hebrewMonthLabel(month.period.month)} ${year} — פירוט כספי`;
  styleTitleCell(sheet.getCell(1, 1));
  sheet.mergeCells(1, 1, 1, PAYMENT_COLS);
  const phaseNote =
    month.period.phase === 'partial'
      ? 'חודש נוכחי — נתוני ביצוע עד מועד ההפקה; שורות «צפוי» אינן מסומנות כשולמו.'
      : month.period.phase === 'future'
        ? 'חודש עתידי — מוצגות התחייבויות ותחזיות בלבד, ללא סימון תשלום שבוצע.'
        : 'חודש שהסתיים — נתוני ביצוע.';
  writeTextCell(sheet.getCell(2, 1), phaseNote, { wrap: true });
  sheet.mergeCells(2, 1, 2, PAYMENT_COLS);

  let cursor = 4;
  cursor = writePaymentTable(
    sheet,
    cursor,
    `א. תשלומים שבוצעו (${month.payments.length})`,
    month.payments,
  );
  cursor = writePaymentTable(
    sheet,
    cursor,
    `ב. תקבולים מלקוחות (${month.receipts.length})`,
    month.receipts.map((r) => ({
      date: r.date,
      party: r.client,
      description: 'גבייה מלקוח',
      project: r.project,
      net: r.net,
      vat: r.vat,
      gross: r.gross,
      nature: r.nature,
    })),
  );

  writeSectionTitle(sheet, cursor, `ג. עלויות מוכרות (${month.recognizedCosts.length})`, RECOGNIZED_COLS);
  cursor += 1;
  writeHeaderCells(sheet, cursor, [
    'תאריך',
    'ספק',
    'תיאור',
    'פרויקט',
    'קטגוריה',
    'נטו ₪',
    'מע״מ ₪',
    'ברוטו ₪',
  ]);
  cursor += 1;
  if (month.recognizedCosts.length === 0) {
    writeTextCell(sheet.getRow(cursor).getCell(1), 'אין נתונים');
    cursor += 2;
  } else {
    for (const line of month.recognizedCosts) {
      const row = sheet.getRow(cursor);
      writeTextCell(row.getCell(1), line.date);
      writeTextCell(row.getCell(2), line.party);
      writeTextCell(row.getCell(3), line.description, { wrap: true });
      writeTextCell(row.getCell(4), line.project, { wrap: true });
      writeTextCell(row.getCell(5), line.category, { wrap: true });
      writeMoneyCell(row.getCell(6), moneyAmount(line.net));
      writeMoneyCell(row.getCell(7), moneyAmount(line.vat));
      writeMoneyCell(row.getCell(8), moneyAmount(line.gross));
      cursor += 1;
    }
    cursor += 1;
  }

  writeSectionTitle(sheet, cursor, `ד. עלות מעסיק (${month.employerCosts.length})`, EMPLOYER_COLS);
  cursor += 1;
  writeHeaderCells(sheet, cursor, ['חודש', 'עובד', 'פרויקט', 'נטו ₪', 'סוג']);
  cursor += 1;
  if (month.employerCosts.length === 0) {
    writeTextCell(sheet.getRow(cursor).getCell(1), 'אין נתונים');
    cursor += 2;
  } else {
    for (const emc of month.employerCosts) {
      const row = sheet.getRow(cursor);
      writeTextCell(row.getCell(1), emc.yearMonth);
      writeTextCell(row.getCell(2), emc.employee);
      writeTextCell(row.getCell(3), emc.project, { wrap: true });
      writeMoneyCell(row.getCell(4), moneyAmount(emc.net));
      writeTextCell(row.getCell(5), emc.nature === 'final' ? 'סופי' : 'אומדן');
      cursor += 1;
    }
    cursor += 1;
  }

  writeSectionTitle(sheet, cursor, 'ה. הוצאות כלליות ותקורה', OVERHEAD_COLS);
  cursor += 1;
  writeHeaderCells(sheet, cursor, ['קטגוריה', 'נטו ₪']);
  cursor += 1;
  if (month.overhead.length === 0) {
    const row = sheet.getRow(cursor);
    writeTextCell(row.getCell(1), 'אין נתונים');
    writeMoneyCell(row.getCell(2), 0);
    cursor += 2;
  } else {
    for (const slice of month.overhead) {
      const row = sheet.getRow(cursor);
      writeTextCell(row.getCell(1), slice.label, { wrap: true });
      writeMoneyCell(row.getCell(2), moneyAmount(slice.net));
      cursor += 1;
    }
    cursor += 1;
  }

  writeSectionTitle(sheet, cursor, `ו. חיובים ללקוחות (${month.billings.length})`, BILLING_COLS);
  cursor += 1;
  writeHeaderCells(sheet, cursor, [
    'תאריך',
    'לקוח / פרויקט',
    'אסמכתא',
    'נטו ₪',
    'מע״מ ₪',
    'ברוטו ₪',
    'סטטוס',
  ]);
  cursor += 1;
  if (month.billings.length === 0) {
    writeTextCell(sheet.getRow(cursor).getCell(1), 'אין נתונים');
    cursor += 2;
  } else {
    for (const bill of month.billings) {
      const row = sheet.getRow(cursor);
      writeTextCell(row.getCell(1), bill.issueDate);
      writeTextCell(row.getCell(2), bill.client, { wrap: true });
      writeTextCell(row.getCell(3), bill.reference);
      writeMoneyCell(row.getCell(4), moneyAmount(bill.net));
      writeMoneyCell(row.getCell(5), moneyAmount(bill.vat));
      writeMoneyCell(row.getCell(6), moneyAmount(bill.gross));
      writeTextCell(row.getCell(7), bill.status);
      cursor += 1;
    }
    cursor += 1;
  }

  cursor = writePaymentTable(
    sheet,
    cursor,
    `ז. התחייבויות עתידיות (${month.commitments.length})`,
    month.commitments,
  );

  writeSectionTitle(
    sheet,
    cursor,
    'ח. תשלומי שכר (מזומן — ללא הכרה חוזרת בעלות)',
    PAYMENT_COLS,
  );
  cursor = writePaymentTable(sheet, cursor + 1, '', month.payrollCash);

  writeSectionTitle(sheet, cursor, 'סיכום חודשי', SUMMARY_COLS);
  cursor += 1;
  const summaryRows: Array<[string, number | null]> = [
    ['חיובים נטו', moneyAmount(month.summary.netInvoiced)],
    ['גבייה בפועל ברוטו', moneyAmount(month.summary.grossCollected)],
    ['עלות מוכרת נטו', moneyAmount(month.summary.recognizedCostNet)],
    ['מע״מ עלות מוכרת', moneyAmount(month.summary.recognizedCostVat)],
    ['מזומן ששולם ברוטו', moneyAmount(month.summary.cashPaidGross)],
    ['עלות מעסיק נטו', moneyAmount(month.summary.employerCostNet)],
    ['התחייבויות צפויות ברוטו', moneyAmount(month.summary.expectedCommitmentsGross)],
    ['תזרים נטו בפועל', moneyAmount(month.summary.netCashActual)],
    ['רווח תפעולי (חיוב נטו פחות עלות מוכרת)', moneyAmount(month.summary.operationalProfitNet)],
  ];
  for (const [label, amount] of summaryRows) {
    const row = sheet.getRow(cursor);
    writeTextCell(row.getCell(1), label, { wrap: true });
    if (amount == null) {
      writeTextCell(row.getCell(2), '—');
    } else {
      writeMoneyCell(row.getCell(2), amount);
    }
    if (label.length > 40) row.height = 36;
    cursor += 1;
  }

  setColumnWidths(sheet, MONTH_SHEET_COLUMN_WIDTHS);
}

function writeOverviewSheet(workbook: ExcelJS.Workbook, data: FinancialYearBookData): void {
  const sheet = workbook.addWorksheet('סקירה שנתית');
  applyRtlSheet(sheet, 4);
  sheet.getCell(1, 1).value = `סקירה פיננסית חודשית | ${data.organizationName}`;
  styleTitleCell(sheet.getCell(1, 1));
  sheet.mergeCells(1, 1, 1, OVERVIEW_COLS);
  writeTextCell(
    sheet.getCell(2, 1),
    `ספר כספי ${data.year} | מטבע: ${data.currency} | הופק: ${data.generatedAt} | לחצו על גיליון חודש לפירוט`,
    { wrap: true },
  );
  sheet.mergeCells(2, 1, 2, OVERVIEW_COLS);
  writeHeaderCells(sheet, 4, [
    'חודש',
    'עלות מוכרת נטו',
    'מזומן ששולם ברוטו',
    'עלות מעסיק',
    'חיובים נטו',
    'גבייה ברוטו',
    'מספר תשלומים',
    'מספר תקבולים',
  ]);
  sheet.getRow(4).height = 28;
  let rowNum = 5;
  for (const row of data.overview) {
    const excelRow = sheet.getRow(rowNum);
    writeTextCell(excelRow.getCell(1), row.monthLabel);
    writeMoneyCell(excelRow.getCell(2), row.recognizedNet);
    writeMoneyCell(excelRow.getCell(3), row.cashPaidGross);
    writeMoneyCell(excelRow.getCell(4), row.employerNet);
    writeMoneyCell(excelRow.getCell(5), row.netInvoiced);
    writeMoneyCell(excelRow.getCell(6), row.grossCollected);
    writeIntegerCell(excelRow.getCell(7), row.paymentCount);
    writeIntegerCell(excelRow.getCell(8), row.receiptCount);
    rowNum += 1;
  }
  setColumnWidths(sheet, OVERVIEW_COLUMN_WIDTHS);
}

function writeGuideSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('הסבר לקריאה');
  applyRtlSheet(sheet, 1);
  const lines = [
    'מדריך קריאה לספר כספי שנתי',
    '',
    '• «בוצע» — תשלום, גבייה או עלות שהתרחשו בפועל.',
    '• «צפוי» — התחייבות, תשלום מתוכנן או גבייה צפויה שטרם התקבלה.',
    '• עלות מוכרת — לפי מנגנון ההכרה במערכת (כולל תשלומים, AP ועלות מעסיק).',
    '• תשלומי שכר — תזרים מזומן בלבד; עלות המעסיק מוצגת בנפרד.',
    '• חיוב ללקוח — מסמך שהופק; תקבול — מזומן שהתקבל (תאריך תשלום).',
    '• חודש עתידי — אין סימון תשלום כאילו בוצע.',
    '• הסכומים מחושבים מנתוני הארגון שלכם ב-ProjectFlow — אין שימוש בנוסחאות נפרדות.',
  ];
  lines.forEach((line, index) => {
    const row = sheet.getRow(index + 1);
    row.getCell(1).value = line;
    if (index === 0) row.font = { bold: true, size: 13 };
  });
  sheet.getColumn(1).width = 72;
}

export async function buildFinancialYearBookWorkbook(data: FinancialYearBookData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ProjectFlow';
  workbook.created = new Date();
  writeOverviewSheet(workbook, data);
  writeGuideSheet(workbook);
  for (const month of data.months) {
    writeMonthSheet(workbook, month, data.year);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function financialYearBookFileName(year: number): string {
  return `ספר_כספי_${year}.xlsx`;
}

export function assertWorkbookHasNoUuids(buffer: Buffer): boolean {
  const text = buffer.toString('latin1');
  return !/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(text);
}
