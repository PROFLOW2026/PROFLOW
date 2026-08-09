import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { previewImport } from '@/modules/imports/application/preview-import';
import { confirmImport } from '@/modules/imports/application/confirm-import';
import { listImportableKinds } from '@/modules/imports/application/import-permissions';
import { autoMapColumns, applyMapping, normalizeHeader } from '@/modules/imports/domain/column-mapping';
import { parseCsv, stripBom, CsvParseError } from '@/modules/imports/domain/csv-parse';
import {
  ENABLED_IMPORT_KINDS,
  isEnabledImportKind,
} from '@/modules/imports/domain/types';
import { validateMappedValues } from '@/modules/imports/validation/validate-rows';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

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

describe('imports expense kind stays disabled', () => {
  it('does not treat expenses as an enabled confirm kind', () => {
    expect(isEnabledImportKind('expenses')).toBe(false);
    expect(ENABLED_IMPORT_KINDS).not.toContain('expenses');
    expect([...ENABLED_IMPORT_KINDS]).toEqual(['clients', 'vendors', 'employees', 'projects']);
  });

  it('never lists expenses among importable kinds even with expense create permission', () => {
    const context = contextWith([
      PERMISSIONS.CLIENTS_MANAGE,
      PERMISSIONS.VENDORS_MANAGE,
      PERMISSIONS.WORKFORCE_MANAGE,
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.EXPENSES_CREATE,
    ]);
    expect(listImportableKinds(context)).toEqual([
      'clients',
      'vendors',
      'employees',
      'projects',
    ]);
  });

  it('preview returns enabled:false for expenses without writing rows', () => {
    const context = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const preview = previewImport(context, {
      kind: 'expenses',
      csvText: 'Date,Description,Amount\n2026-01-01,Cement,100\n',
    });
    expect(preview.enabled).toBe(false);
    expect(preview.rows).toEqual([]);
    expect(preview.validCount).toBe(0);
  });

  it('confirm rejects expenses before create* APIs run', async () => {
    const context = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    await expect(
      confirmImport(context, {
        kind: 'expenses',
        csvText: 'Date,Description,Amount\n2026-01-01,Cement,100\n',
        mapping: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
