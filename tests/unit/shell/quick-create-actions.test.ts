import { describe, expect, it } from 'vitest';
import { buildQuickCreateActions } from '@/components/shell/quick-create-actions';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';

function modules(overrides: Partial<ModuleVisibility> = {}): ModuleVisibility {
  return {
    ...(Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, false])) as ModuleVisibility),
    ...overrides,
  };
}

describe('buildQuickCreateActions', () => {
  it('keeps core create paths and avoids dumping every module', () => {
    const actions = buildQuickCreateActions(
      new Set([
        PERMISSIONS.PROJECTS_CREATE,
        PERMISSIONS.EXPENSES_CREATE,
        PERMISSIONS.TIME_MANAGE,
        PERMISSIONS.FIELD_OPS_MANAGE,
        PERMISSIONS.ASSETS_MANAGE,
        PERMISSIONS.AP_MANAGE,
        PERMISSIONS.ATTENDANCE_SELF,
        PERMISSIONS.DOCUMENTS_MANAGE,
        PERMISSIONS.CRM_MANAGE,
        PERMISSIONS.PROCUREMENT_MANAGE,
      ]),
      modules({ field_ops: true, assets: true, documents: true, crm: true, procurement: true }),
      'projects',
    );
    const keys = actions.map((action) => action.key);
    expect(keys).toContain('project');
    expect(keys).toContain('expense');
    expect(keys).toContain('timeEntry');
    expect(keys).toContain('fieldLog');
    expect(keys).toContain('maintenance');
    expect(keys).toContain('vendorBill');
    expect(keys).toContain('attendance');
    expect(keys).not.toContain('document');
    expect(keys).not.toContain('opportunity');
    expect(keys).not.toContain('purchaseOrder');
  });

  it('gates field log / maintenance / vendor bill / attendance tightly', () => {
    const none = buildQuickCreateActions(new Set([PERMISSIONS.PROJECTS_READ]), modules(), 'projects');
    expect(none.map((a) => a.key)).toEqual([]);

    const fieldWithoutModule = buildQuickCreateActions(
      new Set([PERMISSIONS.FIELD_OPS_MANAGE]),
      modules({ field_ops: false }),
      'projects',
    );
    expect(fieldWithoutModule.some((a) => a.key === 'fieldLog')).toBe(false);

    const apOnly = buildQuickCreateActions(new Set([PERMISSIONS.AP_MANAGE]), modules(), 'projects');
    expect(apOnly.map((a) => a.key)).toEqual(['vendorBill']);

    const attendanceReadOnly = buildQuickCreateActions(
      new Set([PERMISSIONS.ATTENDANCE_READ]),
      modules(),
      'projects',
    );
    expect(attendanceReadOnly.some((a) => a.key === 'attendance')).toBe(false);
  });
});
