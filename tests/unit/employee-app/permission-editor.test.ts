import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  EMPLOYEE_PERMISSION_EDITOR_GROUPS,
  buildSaveGrantsPayload,
  detectPresetFromState,
  editorItemForPermission,
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';

describe('employee permission editor', () => {
  it('exposes expanded commercial and finance editor groups', () => {
    const groupIds = EMPLOYEE_PERMISSION_EDITOR_GROUPS.map((group) => group.id);
    expect(groupIds).toEqual(
      expect.arrayContaining([
        'projects',
        'clients',
        'contracts',
        'changes',
        'quotes',
        'pm_tasks',
        'project_finance',
        'billing',
        'expenses',
        'ap',
        'vendors',
        'procurement',
        'documents',
        'workforce',
        'banking',
      ]),
    );
    expect(EMPLOYEE_PERMISSION_EDITOR_GROUPS).toHaveLength(20);
    expect(editorItemForPermission(PERMISSIONS.TASKS_DELETE)?.scopes).toEqual([
      'assigned_only',
      'all_organization',
    ]);
    expect(editorItemForPermission(PERMISSIONS.BANKING_READ)?.scopes).toEqual(['all_organization']);
    expect(editorItemForPermission(PERMISSIONS.BANKING_MANAGE)).toBeUndefined();
    expect(editorItemForPermission(PERMISSIONS.WORKFORCE_COST_READ)).toBeUndefined();
  });

  it('detects foreman preset from grant state', () => {
    const grants = grantsMapFromPreset('foreman');
    const categories = categoriesSetFromPreset('foreman');
    expect(detectPresetFromState(grants, categories)).toBe('foreman');
  });

  it('detects secretary preset from grant state', () => {
    const grants = grantsMapFromPreset('secretary');
    const categories = categoriesSetFromPreset('secretary');
    expect(detectPresetFromState(grants, categories)).toBe('secretary');
  });

  it('returns custom when grants diverge from preset', () => {
    const grants = grantsMapFromPreset('foreman');
    grants.set(PERMISSIONS.CLIENTS_READ, {
      permissionKey: PERMISSIONS.CLIENTS_READ,
      scope: 'all_organization',
      granted: true,
    });
    const categories = categoriesSetFromPreset('foreman');
    expect(detectPresetFromState(grants, categories)).toBe('custom');
  });

  it('does not persist role baseline attendance in save payload', () => {
    const grants = grantsMapFromPreset('field_worker');
    // Mark all grants as roleBaseline to simulate "loaded from role, not custom-granted"
    for (const [key, grant] of grants.entries()) {
      grants.set(key, { ...grant, roleBaseline: true });
    }
    grants.set(PERMISSIONS.ATTENDANCE_SELF, {
      permissionKey: PERMISSIONS.ATTENDANCE_SELF,
      scope: 'self_only',
      granted: true,
      roleBaseline: true,
    });
    expect(buildSaveGrantsPayload(grants)).toEqual([]);
  });
});
