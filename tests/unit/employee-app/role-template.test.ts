import { describe, expect, it } from 'vitest';
import { roleTemplate } from '@/shared/permissions/role-templates';
import { PERMISSIONS } from '@/shared/permissions/catalog';

describe('employee role template', () => {
  it('defaults to attendance only', () => {
    const employee = roleTemplate('employee');
    expect(employee.permissions).toContain(PERMISSIONS.ATTENDANCE_SELF);
    expect(employee.permissions).not.toContain(PERMISSIONS.ORG_READ);
    expect(employee.permissions).not.toContain(PERMISSIONS.PROJECTS_READ);
    expect(employee.permissions).not.toContain(PERMISSIONS.DOCUMENTS_READ);
    expect(employee.permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_READ);
  });

  it('does not change worker template (grandfathered)', () => {
    const worker = roleTemplate('worker');
    expect(worker.permissions).toContain(PERMISSIONS.PROJECTS_READ);
    expect(worker.permissions).toContain(PERMISSIONS.DOCUMENTS_READ);
  });
});
