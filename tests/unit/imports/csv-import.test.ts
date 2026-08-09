import { describe, expect, it } from 'vitest';
import { autoMapColumns, applyMapping, normalizeHeader } from '@/modules/imports/domain/column-mapping';
import { parseCsv, stripBom, CsvParseError } from '@/modules/imports/domain/csv-parse';
import { validateMappedValues } from '@/modules/imports/validation/validate-rows';

describe('imports CSV parse', () => {
  it('strips BOM and parses headers/rows', () => {
    const csv = '\uFEFFName,Email\n"Acme, Inc",a@example.com\n';
    expect(stripBom(csv).startsWith('Name')).toBe(true);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(['Name', 'Email']);
    expect(parsed.rows).toEqual([['Acme, Inc', 'a@example.com']]);
  });

  it('rejects empty and unterminated quotes', () => {
    expect(() => parseCsv('   ')).toThrow(CsvParseError);
    expect(() => parseCsv('a,"b')).toThrow(/Unterminated/);
  });
});

describe('imports mapping + validation', () => {
  it('auto-maps client headers and flags missing required name', () => {
    const headers = ['Client Name', 'Email'];
    const mapping = autoMapColumns('clients', headers);
    expect(mapping.name).toBe(0);
    expect(mapping.email).toBe(1);

    const good = applyMapping(headers, ['Acme', 'a@x.com'], mapping);
    const bad = applyMapping(headers, ['', 'b@x.com'], mapping);

    expect(validateMappedValues('clients', good).some((i) => i.severity === 'error')).toBe(false);
    expect(
      validateMappedValues('clients', bad).some((i) => i.severity === 'error' && i.field === 'name'),
    ).toBe(true);
  });

  it('normalizes header aliases', () => {
    expect(normalizeHeader('Client_Name')).toBe('client_name');
    expect(normalizeHeader(' E-mail ')).toBe('e_mail');
  });
});
