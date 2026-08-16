import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';
import { previewImport } from '@/modules/imports/application/preview-import';
import {
  canImportEmployeeCostFields,
  employeeImportBaseRate,
} from '@/modules/imports/application/import-permissions';
import { fieldDefsForKind } from '@/modules/imports/domain/field-defs';
import { validateMappedRows, rowHasErrors } from '@/modules/imports/validation/validate-rows';

function contextWith(
  permissions: readonly PermissionKey[],
  locale: OrgContext['locale'] = 'he-IL',
): OrgContext {
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
    locale,
  };
}

/** Manager template + roster manage - not employer-cost manage. */
function managerWithRoster(): OrgContext {
  return contextWith([...roleTemplate('manager').permissions, PERMISSIONS.WORKFORCE_MANAGE]);
}

function actorWithCostManage(): OrgContext {
  return contextWith([
    ...roleTemplate('manager').permissions,
    PERMISSIONS.WORKFORCE_MANAGE,
    PERMISSIONS.WORKFORCE_COST_MANAGE,
  ]);
}

describe('employee import rate vs roster permission', () => {
  it('does not treat workforce.manage as cost manage', () => {
    const manager = managerWithRoster();
    expect(manager.permissions.has(PERMISSIONS.WORKFORCE_MANAGE)).toBe(true);
    expect(manager.permissions.has(PERMISSIONS.WORKFORCE_COST_MANAGE)).toBe(false);
    expect(canImportEmployeeCostFields(manager)).toBe(false);
    expect(roleTemplate('manager').permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_MANAGE);
  });

  it('marks baseRate as a cost-managed field including aliases', () => {
    const baseRate = fieldDefsForKind('employees').find((f) => f.key === 'baseRate');
    expect(baseRate?.requiresCostManage).toBe(true);
    expect(baseRate?.aliases).toEqual(expect.arrayContaining(['base_rate', 'rate', 'תעריף']));
  });

  it('errors on baseRate when actor has workforce.manage but not workforce.cost.manage', () => {
    const rows = validateMappedRows(
      'employees',
      [{ rowNumber: 2, values: { name: 'Dana', baseRate: '120' } }],
      { locale: 'en', canManageWorkforceCost: false },
    );
    expect(rowHasErrors(rows[0]!)).toBe(true);
    const issue = rows[0]!.issues.find((i) => i.field === 'baseRate' && i.severity === 'error');
    expect(issue).toBeDefined();
    expect(issue!.message).toMatch(/clear this field/i);
    expect(issue!.message).not.toMatch(/silently/i);
  });

  it('accepts baseRate when actor has workforce.cost.manage', () => {
    const rows = validateMappedRows(
      'employees',
      [{ rowNumber: 2, values: { name: 'Dana', baseRate: '120' } }],
      { locale: 'en', canManageWorkforceCost: true },
    );
    expect(rowHasErrors(rows[0]!)).toBe(false);
    expect(rows[0]!.issues.some((i) => i.field === 'baseRate' && i.severity === 'error')).toBe(
      false,
    );
  });

  it('still allows the rest of the employee after the rate field is cleared', () => {
    const withRate = validateMappedRows(
      'employees',
      [{ rowNumber: 2, values: { name: 'Dana', email: 'dana@x.co', baseRate: '120' } }],
      { canManageWorkforceCost: false },
    );
    expect(rowHasErrors(withRate[0]!)).toBe(true);

    const cleared = validateMappedRows(
      'employees',
      [{ rowNumber: 2, values: { name: 'Dana', email: 'dana@x.co', baseRate: '' } }],
      { canManageWorkforceCost: false },
    );
    expect(rowHasErrors(cleared[0]!)).toBe(false);
    expect(
      cleared[0]!.issues.some((i) => i.severity === 'warning' && i.field === 'baseRate'),
    ).toBe(true);
  });

  it('preview: manager with roster manage cannot import baseRate (Hebrew-ready field error)', () => {
    const preview = previewImport(managerWithRoster(), {
      kind: 'employees',
      csvText: 'name,baseRate\nDana,120\n',
    });
    expect(preview.errorCount).toBe(1);
    expect(rowHasErrors(preview.rows[0]!)).toBe(true);
    const issue = preview.rows[0]!.issues.find(
      (i) => i.field === 'baseRate' && i.severity === 'error',
    );
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('אין הרשאה');
    expect(issue!.message).toContain('נקו את השדה');
  });

  it('preview: rate aliases (rate / תעריף) are the same cost field and are rejected without cost.manage', () => {
    const viaRate = previewImport(managerWithRoster(), {
      kind: 'employees',
      csvText: 'name,rate\nDana,95\n',
    });
    expect(viaRate.mapping.baseRate).toBe(1);
    expect(rowHasErrors(viaRate.rows[0]!)).toBe(true);
    expect(
      viaRate.rows[0]!.issues.some((i) => i.field === 'baseRate' && i.severity === 'error'),
    ).toBe(true);

    const viaHebrew = previewImport(managerWithRoster(), {
      kind: 'employees',
      csvText: 'שם,תעריף\nדנה,95\n',
    });
    expect(viaHebrew.mapping.baseRate).toBe(1);
    expect(rowHasErrors(viaHebrew.rows[0]!)).toBe(true);
    expect(
      viaHebrew.rows[0]!.issues.some((i) => i.field === 'baseRate' && i.severity === 'error'),
    ).toBe(true);
  });

  it('preview: actor with workforce.cost.manage can import baseRate', () => {
    const preview = previewImport(actorWithCostManage(), {
      kind: 'employees',
      csvText: 'name,baseRate\nDana,120\n',
    });
    expect(preview.errorCount).toBe(0);
    expect(rowHasErrors(preview.rows[0]!)).toBe(false);
    expect(preview.rows[0]!.values.baseRate).toBe('120');
  });

  it('defense in depth: confirm helper never returns baseRate without cost.manage', () => {
    expect(employeeImportBaseRate(managerWithRoster(), '120')).toBeUndefined();
    expect(employeeImportBaseRate(managerWithRoster(), '  ')).toBeUndefined();
    expect(employeeImportBaseRate(actorWithCostManage(), '120')).toBe('120');
    expect(employeeImportBaseRate(actorWithCostManage(), ' 150 ')).toBe('150');
    expect(canImportEmployeeCostFields(actorWithCostManage())).toBe(true);
  });
});
