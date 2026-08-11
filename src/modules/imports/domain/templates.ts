/**
 * Downloadable CSV/XLSX-ready templates for onboarding import.
 * Headers include English canonical names; Hebrew aliases are documented in field-defs.
 */

import type { ImportKind } from './types';
import { fieldDefsForKind } from './field-defs';

const EXAMPLE_ROWS: Partial<Record<ImportKind, readonly (readonly string[])[]>> = {
  clients: [
    ['Acme Ltd', 'Acme Legal', 'ops@acme.example', '050-0000000', 'Tel Aviv', 'IL', ''],
  ],
  contacts: [
    ['Acme Ltd', '', 'Dana Cohen', 'primary', 'dana@acme.example', '050-1111111', ''],
  ],
  vendors: [['Supply Co', 'supplier', 'sales@supply.example', '03-5555555', 'Haifa', 'IL', '']],
  employees: [['Avi Levi', 'avi@example.com', '050-2222222', 'Electrician', 'E-100', 'hourly', '120', '']],
  projects: [
    ['Building A MEP', 'project', 'active', '', 'Acme Ltd', 'Tel Aviv', '2026-01-01', '2026-12-31', '', ''],
    ['Panel upgrade', 'job', 'active', '', 'Acme Ltd', 'Ramat Gan', '2026-03-01', '', '', ''],
  ],
  opening_values: [['', 'Building A MEP', '100000', 'ILS', '', 'false']],
  cost_categories: [
    ['materials_electrical', 'Electrical materials', 'direct_project'],
    ['travel_field', 'Field travel', 'direct_project'],
  ],
  expenses: [['2026-03-01', 'Cable purchase', '450.00', 'ILS', '', '', 'Supply Co', 'direct_project', '']],
};

export function importTemplateHeaders(kind: ImportKind): readonly string[] {
  return fieldDefsForKind(kind).map((field) => field.key);
}

export function importTemplateExampleRows(kind: ImportKind): readonly (readonly string[])[] {
  return EXAMPLE_ROWS[kind] ?? [];
}

/** CSV text with BOM for Excel Hebrew compatibility. */
export function buildImportTemplateCsv(kind: ImportKind): string {
  const headers = importTemplateHeaders(kind);
  const rows = importTemplateExampleRows(kind);
  const escape = (cell: string) => {
    if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const lines = [headers.map(escape).join(',')];
  for (const row of rows) {
    lines.push(headers.map((_, i) => escape(row[i] ?? '')).join(','));
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function importTemplateFileName(kind: ImportKind, locale: string): string {
  const lang = locale === 'he-IL' ? 'he' : 'en';
  return `projectflow-import-${kind}-${lang}.csv`;
}
