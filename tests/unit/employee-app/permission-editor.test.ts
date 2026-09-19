import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  buildSaveGrantsPayload,
  detectPresetFromState,
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';

describe('employee permission editor', () => {
  it('detects foreman preset from grant state', () => {
    const grants = grantsMapFromPreset('foreman');
    const categories = categoriesSetFromPreset('foreman');
    expect(detectPresetFromState(grants, categories)).toBe('foreman');
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
