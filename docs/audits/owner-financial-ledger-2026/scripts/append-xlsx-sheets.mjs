import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(readFileSync(resolve(OUT, 'ledger-data.json'), 'utf8'));
const fmt = (v) => Number(v ?? 0).toFixed(2);

function addSheet(wb, name, rows) {
  if (wb.getWorksheet(name)) wb.removeWorksheet(name);
  const ws = wb.addWorksheet(name.slice(0, 31));
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  ws.addRow(cols);
  for (const r of rows) ws.addRow(cols.map((c) => r[c] ?? ''));
  ws.getRow(1).font = { bold: true };
}

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(resolve(OUT, 'MASTER_FINANCIAL_LEDGER_2026.xlsx'));

addSheet(
  wb,
  'LABOR_ALLOCATION_LINES',
  raw.laborLines
    .filter((l) => l.run_status === 'applied')
    .map((l) => ({
      id: l.id,
      year_month: l.year_month,
      employee_name: l.employee_name,
      project_id: l.project_id,
      project_name: l.project_name,
      amount: fmt(l.amount),
      percent: l.percent,
      basis_hours: l.basis_hours,
      applied_at: l.applied_at,
    })),
);
addSheet(
  wb,
  'EMC_JOURNAL',
  raw.emcJournal.map((e) => ({
    id: e.id,
    employee_name: e.employee_name,
    year_month: e.year_month,
    known_amount: fmt(e.known_amount),
    known_quality: e.known_quality,
    status: e.status,
    source: e.source,
    adjusts_month_id: e.adjusts_month_id || '',
    created_at: e.created_at,
  })),
);
addSheet(
  wb,
  'RATE_VERSIONS',
  raw.rateVersions.map((r) => ({
    id: r.id,
    employee_name: r.employee_name,
    valid_from: r.valid_from,
    valid_to: r.valid_to || '',
    base_rate: fmt(r.base_rate),
    rate_unit: r.rate_unit,
    burden_percent: r.burden_percent,
    estimated_employer_cost: r.estimated_employer_cost ? fmt(r.estimated_employer_cost) : '',
  })),
);
addSheet(
  wb,
  'MGR_SCHEDULE',
  raw.mgrLines.map((m) => ({
    expense_id: m.expense_id,
    year_month: m.year_month,
    amount: fmt(m.amount),
    status: m.status,
  })),
);

await wb.xlsx.writeFile(resolve(OUT, 'MASTER_FINANCIAL_LEDGER_2026.xlsx'));
console.log('appended sheets OK');
