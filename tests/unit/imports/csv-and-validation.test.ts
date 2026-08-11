import { describe, expect, it } from 'vitest';
import { parseCsv, stripBom, CsvParseError } from '@/modules/imports/domain/csv-parse';
import {
  autoMapColumns,
  applyMapping,
  normalizeHeader,
} from '@/modules/imports/domain/column-mapping';
import { validateMappedRows, rowHasErrors } from '@/modules/imports/validation/validate-rows';

describe('csv parse', () => {
  it('strips utf-8 bom', () => {
    expect(stripBom('\uFEFFname,email')).toBe('name,email');
  });

  it('parses quoted commas and escaped quotes', () => {
    const csv = 'name,city\r\n"Acme, Inc.","Tel ""Aviv"""\r\n';
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['name', 'city']);
    expect(parsed.rows).toEqual([['Acme, Inc.', 'Tel "Aviv"']]);
  });

  it('rejects empty and unterminated quotes', () => {
    expect(() => parseCsv('   ')).toThrow(CsvParseError);
    expect(() => parseCsv('name\n"open')).toThrow(/Unterminated/);
  });

  it('skips blank data rows and pads short rows', () => {
    const parsed = parseCsv('a,b,c\n1,2\n\n3,4,5,6\n');
    expect(parsed.rows).toEqual([
      ['1', '2', ''],
      ['3', '4', '5'],
    ]);
  });
});

describe('column mapping', () => {
  it('normalizes hebrew and english headers', () => {
    expect(normalizeHeader('Client Name')).toBe('client_name');
    expect(normalizeHeader('שם לקוח')).toBe('שם_לקוח');
  });

  it('auto-maps client aliases', () => {
    const mapping = autoMapColumns('clients', ['שם', 'email', 'phone']);
    expect(mapping.name).toBe(0);
    expect(mapping.email).toBe(1);
    expect(mapping.phone).toBe(2);
    expect(mapping.legalName).toBe(-1);
  });

  it('applies mapping to row cells', () => {
    const values = applyMapping(['Name', 'Email'], ['Ada', 'ada@example.com'], {
      name: 0,
      email: 1,
      phone: -1,
    });
    expect(values).toEqual({ name: 'Ada', email: 'ada@example.com', phone: '' });
  });
});

describe('row validation', () => {
  it('flags missing client name as error', () => {
    const rows = validateMappedRows('clients', [
      { rowNumber: 2, values: { name: '', email: 'bad' } },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(true);
    expect(rows[0]!.issues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('accepts minimal valid client and vendor rows', () => {
    const clients = validateMappedRows('clients', [
      { rowNumber: 2, values: { name: 'Acme', email: 'a@b.co' } },
    ]);
    expect(rowHasErrors(clients[0]!)).toBe(false);

    const vendors = validateMappedRows('vendors', [
      { rowNumber: 2, values: { name: 'Supply Co', type: 'supplier' } },
    ]);
    expect(rowHasErrors(vendors[0]!)).toBe(false);
  });

  it('defaults employee rate unit and warns when base rate missing', () => {
    const rows = validateMappedRows('employees', [
      { rowNumber: 2, values: { name: 'Dana' } },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(false);
    expect(rows[0]!.issues.some((i) => i.severity === 'warning' && i.field === 'baseRate')).toBe(
      true,
    );
  });

  it('rejects invalid project status', () => {
    const rows = validateMappedRows('projects', [
      { rowNumber: 2, values: { name: 'Tower', status: 'nope' } },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(true);
    expect(rows[0]!.issues.some((i) => i.field === 'status')).toBe(true);
  });

  it('accepts project with iso dates', () => {
    const rows = validateMappedRows('projects', [
      {
        rowNumber: 2,
        values: {
          name: 'Tower',
          status: 'active',
          startDate: '2026-01-01',
          targetEndDate: '2026-12-31',
        },
      },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(false);
  });

  it('accepts contacts and rejects financial columns on projects', () => {
    const contacts = validateMappedRows('contacts', [
      { rowNumber: 2, values: { clientName: 'Acme', name: 'Dana' } },
    ]);
    expect(rowHasErrors(contacts[0]!)).toBe(false);

    const projects = validateMappedRows('projects', [
      {
        rowNumber: 2,
        values: { name: 'Site A', workKind: 'job', contractValueAmount: '1000' },
      },
    ]);
    expect(rowHasErrors(projects[0]!)).toBe(true);
    expect(projects[0]!.issues.some((i) => i.message.includes('opening_values'))).toBe(true);
  });

  it('validates opening values and cost categories', () => {
    const opening = validateMappedRows('opening_values', [
      {
        rowNumber: 2,
        values: { projectName: 'Site A', contractValueAmount: '50000' },
      },
    ]);
    expect(rowHasErrors(opening[0]!)).toBe(false);

    const categories = validateMappedRows('cost_categories', [
      { rowNumber: 2, values: { name: 'Cable', family: 'direct_project' } },
    ]);
    expect(rowHasErrors(categories[0]!)).toBe(false);
  });
});
