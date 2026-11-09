import { describe, expect, it } from 'vitest';
import { resolveInfraPermissions, type InfraPermissionFacts } from '@/modules/infra-mapping/domain/permissions';

const base: InfraPermissionFacts = {
  external: false,
  canDocument: true,
  canManageCaptures: false,
  canManageLocations: false,
  hasDocumentsView: true,
  storageGateOpen: true,
  employeeApp: false,
  canManageDefects: false,
};

describe('one capability model for owner, employee and contractor', () => {
  it('gives an employee exactly the owner capabilities when the permissions are equal', () => {
    const owner = resolveInfraPermissions(base);
    const employee = resolveInfraPermissions({ ...base, employeeApp: true });
    expect(employee.canDocument).toBe(owner.canDocument);
    expect(employee.canCaptureVideo).toBe(true);
    expect(employee.canBrowseStorage).toBe(owner.canBrowseStorage);
    expect(employee.canBrowseStorage).toBe(true);
    expect(employee.canManageCaptures).toBe(owner.canManageCaptures);
    expect(employee.canManageLocations).toBe(owner.canManageLocations);
  });

  it('lets an employee with the manage permissions manage locations and captures like the owner', () => {
    const employee = resolveInfraPermissions({ ...base, employeeApp: true, canManageCaptures: true, canManageLocations: true });
    expect(employee).toMatchObject({ canManageCaptures: true, canManageLocations: true });
  });

  it('does not grant an employee storage browsing when the file gate is closed or documents.view is missing', () => {
    expect(resolveInfraPermissions({ ...base, employeeApp: true, storageGateOpen: false }).canBrowseStorage).toBe(false);
    expect(resolveInfraPermissions({ ...base, employeeApp: true, hasDocumentsView: false }).canBrowseStorage).toBe(false);
  });

  it('gives a contractor with the upload grant the same documenting and video capability', () => {
    const contractor = resolveInfraPermissions({ ...base, external: true, hasDocumentsView: false });
    expect(contractor.canDocument).toBe(true);
    expect(contractor.canCaptureVideo).toBe(true);
  });

  it('never grants video or documenting without the right to document', () => {
    const viewOnly = resolveInfraPermissions({ ...base, external: true, canDocument: false, hasDocumentsView: false });
    expect(viewOnly.canDocument).toBe(false);
    expect(viewOnly.canCaptureVideo).toBe(false);
  });

  it('keeps raw organization-storage browsing and provider links off for those with no read grant or provider login', () => {
    const contractor = resolveInfraPermissions({ ...base, external: true, hasDocumentsView: false });
    expect(contractor.canBrowseStorage).toBe(false);
    expect(contractor.canOpenInCloud).toBe(false);
    expect(contractor.canManageLocations).toBe(false);
    const employee = resolveInfraPermissions({ ...base, employeeApp: true });
    expect(employee.canOpenInCloud).toBe(false);
    expect(resolveInfraPermissions(base).canOpenInCloud).toBe(true);
  });

  it('the owner without documents.view cannot open provider links either', () => {
    expect(resolveInfraPermissions({ ...base, hasDocumentsView: false }).canOpenInCloud).toBe(false);
  });
});
