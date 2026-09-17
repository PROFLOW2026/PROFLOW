import { describe, expect, it } from 'vitest';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { PermissionKey } from '@/shared/permissions/catalog';

describe('resolveEmployeeAppEffectivePermissions', () => {
  it('includes attendance baseline only for empty grants', () => {
    const permissions = resolveEmployeeAppEffectivePermissions(new Map());
    expect(permissions.has(PERMISSIONS.ATTENDANCE_SELF)).toBe(true);
    expect(permissions.has(PERMISSIONS.ORG_READ)).toBe(false);
    expect(permissions.has(PERMISSIONS.PROJECTS_READ)).toBe(false);
  });

  it('adds explicit grants without inheriting owner role keys', () => {
    const grants = new Map<PermissionKey, { granted: boolean }>([
      [PERMISSIONS.PROJECTS_READ, { granted: true }],
      [PERMISSIONS.PROJECT_FINANCIALS_READ, { granted: true }],
    ]);
    const permissions = resolveEmployeeAppEffectivePermissions(grants);
    expect(permissions.has(PERMISSIONS.ATTENDANCE_SELF)).toBe(true);
    expect(permissions.has(PERMISSIONS.PROJECTS_READ)).toBe(true);
    expect(permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ)).toBe(true);
    expect(permissions.has(PERMISSIONS.ORG_READ)).toBe(false);
  });
});
