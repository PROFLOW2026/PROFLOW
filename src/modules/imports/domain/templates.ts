/**
 * Downloadable CSV/XLSX-ready templates for onboarding import.
 * Headers include English canonical names; Hebrew aliases are documented in field-defs.
 * For he-IL, BOQ templates use Hebrew header labels (still auto-mapped via aliases).
 */

import type { ImportFieldDef, ImportKind } from './types';
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
  inventory: [['NYM cable 3x1.5', 'CABLE-3X15', 'm', '7290001234567', '50', '20', '100']],
  boq_items: [
    ['01.01', 'Excavation for foundations', 'm3', '120', '85.50', '10260.00', 'Earthworks', 'Foundations'],
    ['01.02', 'Lean concrete blinding', 'm2', '80', '45', '3600', 'Earthworks', 'Foundations'],
    ['02.01', 'Formwork walls', 'm2', '200', '120.00', '24000.00', 'Concrete', 'Walls'],
  ],
  billing_plan: [
    ['Structure', 'Foundations', '30000', '30', '2026-06-01', '', 'percent_of_contract'],
    ['Structure', 'Frame', '40000', '40', '2026-09-01', '', 'percent_of_contract'],
    ['Closeout', 'Handover', '30000', '30', '2026-12-01', '', 'percent_of_contract'],
  ],
};

const BOQ_HE_EXAMPLE_ROWS: readonly (readonly string[])[] = [
  ['01.01', 'חפירה ליסודות', 'מ"ק', '120', '85.50', '10260.00', 'עפר', 'יסודות'],
  ['01.02', 'בטון רזה', 'מ"ר', '80', '45', '3600', 'עפר', 'יסודות'],
  ['02.01', 'תבניות לקירות', 'מ"ר', '200', '120.00', '24000.00', 'בטון', 'קירות'],
];

function hebrewAlias(field: ImportFieldDef): string | undefined {
  return field.aliases.find((alias) => /[\u0590-\u05FF]/.test(alias));
}

export function importTemplateHeaders(kind: ImportKind, locale?: string): readonly string[] {
  const fields = fieldDefsForKind(kind);
  if (locale === 'he-IL' && kind === 'boq_items') {
    return fields.map((field) => hebrewAlias(field) ?? field.key);
  }
  return fields.map((field) => field.key);
}

export function importTemplateExampleRows(
  kind: ImportKind,
  locale?: string,
): readonly (readonly string[])[] {
  if (kind === 'boq_items' && locale === 'he-IL') return BOQ_HE_EXAMPLE_ROWS;
  return EXAMPLE_ROWS[kind] ?? [];
}

/** CSV text with BOM for Excel Hebrew compatibility. */
export function buildImportTemplateCsv(kind: ImportKind, locale?: string): string {
  const headers = importTemplateHeaders(kind, locale);
  const rows = importTemplateExampleRows(kind, locale);
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
