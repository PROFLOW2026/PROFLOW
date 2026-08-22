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
  detectExistingDuplicates,
  detectWithinFileDuplicates,
  emptyExistingIndex,
  mergeIssueMaps,
} from '@/modules/imports/domain/duplicates';
import {
  ENABLED_IMPORT_KINDS,
  isEnabledImportKind,
} from '@/modules/imports/domain/types';
import { validateMappedRows, validateMappedValues, rowHasErrors } from '@/modules/imports/validation/validate-rows';

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

  it('rejects invalid project dates', () => {
    const badDate = validateMappedValues(
      'projects',
      { name: 'Site', startDate: '01/02/2026' },
      { baseCurrency: 'ILS' },
    );
    expect(badDate.some((i) => i.field === 'startDate' && i.severity === 'error')).toBe(true);
  });
});

describe('imports duplicates', () => {
  it('flags duplicate emails within file as errors', () => {
    const rows = validateMappedRows(
      'clients',
      [
        { rowNumber: 2, values: { name: 'A', email: 'same@x.com' } },
        { rowNumber: 3, values: { name: 'B', email: 'same@x.com' } },
      ],
      { baseCurrency: 'ILS' },
    );
    const merged = mergeIssueMaps(rows, detectWithinFileDuplicates('clients', rows));
    expect(merged[0]!.issues.some((i) => i.field === 'email' && i.severity === 'error')).toBe(true);
    expect(merged[1]!.issues.some((i) => i.field === 'email' && i.severity === 'error')).toBe(true);
  });

  it('blocks re-import of existing emails / employee numbers (duplicate retry)', () => {
    const index = {
      ...emptyExistingIndex(),
      emails: new Set(['ada@example.com']),
      employeeNumbers: new Set(['e-9']),
    };

    const emailDup = detectExistingDuplicates(
      'clients',
      [{ rowNumber: 2, values: { name: 'Ada', email: 'ada@example.com' }, issues: [] }],
      index,
    );
    expect(emailDup.get(2)?.some((i) => i.field === 'email' && i.severity === 'error')).toBe(true);

    const empDup = detectExistingDuplicates(
      'employees',
      [{ rowNumber: 2, values: { name: 'Dana', employeeNumber: 'E-9' }, issues: [] }],
      index,
    );
    expect(empDup.get(2)?.some((i) => i.field === 'employeeNumber' && i.severity === 'error')).toBe(
      true,
    );
  });
});

describe('imports kinds', () => {
  it('enables expenses as draft-only confirm kind', () => {
    expect(isEnabledImportKind('expenses')).toBe(true);
    expect([...ENABLED_IMPORT_KINDS]).toEqual([
      'clients',
      'contacts',
      'vendors',
      'employees',
      'projects',
      'opening_values',
      'cost_categories',
      'expenses',
      'inventory',
      'boq_items',
      'billing_plan',
    ]);
  });

  it('lists expenses when expense create permission is present', () => {
    const context = contextWith([
      PERMISSIONS.CLIENTS_MANAGE,
      PERMISSIONS.VENDORS_MANAGE,
      PERMISSIONS.WORKFORCE_MANAGE,
      PERMISSIONS.PROJECTS_CREATE,
      PERMISSIONS.EXPENSES_CREATE,
    ]);
    expect(listImportableKinds(context)).toEqual([
      'clients',
      'contacts',
      'vendors',
      'employees',
      'projects',
      'expenses',
    ]);
  });

  it('preview validates expense rows without writing', () => {
    const context = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    const preview = previewImport(context, {
      kind: 'expenses',
      csvText: 'Date,Description,Amount\n2026-01-01,Cement,100\n',
    });
    expect(preview.enabled).toBe(true);
    expect(preview.validCount).toBe(1);
    expect(rowHasErrors(preview.rows[0]!)).toBe(false);
  });

  it('errors when project rows carry financial amounts (use opening_values)', () => {
    const rows = validateMappedRows('projects', [
      {
        rowNumber: 2,
        values: { name: 'Site A', contractValueAmount: '50000' },
      },
    ]);
    expect(rowHasErrors(rows[0]!)).toBe(true);
    expect(rows[0]!.issues.some((i) => i.severity === 'error' && /opening_values/i.test(i.message))).toBe(
      true,
    );
  });

  it('confirm rejects unknown kind before create* APIs run', async () => {
    const context = contextWith([PERMISSIONS.EXPENSES_CREATE]);
    await expect(
      confirmImport(context, {
        kind: 'not-a-kind',
        csvText: 'Date,Description,Amount\n2026-01-01,Cement,100\n',
        mapping: {},
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
