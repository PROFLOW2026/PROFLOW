import { describe, expect, it } from 'vitest';
import { resolveTakeoffPermissions } from '@/modules/electrical-takeoff/domain/permissions';

const base = {
  persistenceMode: 'persistent' as const,
  canPickFromProjectCloud: true,
};

describe('resolveTakeoffPermissions', () => {
  it('grants parity when internal permissions match', () => {
    const p = resolveTakeoffPermissions({
      ...base,
      external: false,
      canView: true,
      canManage: true,
      canApprove: true,
      canManageLibrary: true,
      analysisApproved: false,
    });
    expect(p).toEqual({
      canRun: true,
      canEdit: true,
      canApprove: true,
      canManageLibrary: true,
      canReopen: true,
      canPickFromProjectCloud: true,
      canPurgeEphemeral: false,
    });
  });

  it('locks edit when approved', () => {
    const p = resolveTakeoffPermissions({
      ...base,
      external: true,
      canView: true,
      canManage: true,
      canApprove: true,
      canManageLibrary: false,
      analysisApproved: true,
    });
    expect(p.canEdit).toBe(false);
    expect(p.canRun).toBe(false);
  });

  it('contractor without manage cannot edit', () => {
    const p = resolveTakeoffPermissions({
      ...base,
      external: true,
      canView: true,
      canManage: false,
      canApprove: false,
      canManageLibrary: false,
      analysisApproved: false,
    });
    expect(p.canEdit).toBe(false);
    expect(p.canRun).toBe(false);
  });

  it('parity: identical facts on main vs employee vs contractor surfaces', () => {
    const facts = {
      ...base,
      external: false,
      canView: true,
      canManage: true,
      canApprove: false,
      canManageLibrary: true,
      analysisApproved: false,
    };
    const main = resolveTakeoffPermissions(facts);
    const employee = resolveTakeoffPermissions({ ...facts, external: false });
    const contractor = resolveTakeoffPermissions({ ...facts, external: true });
    expect(employee).toEqual(main);
    expect(contractor).toEqual(main);
  });

  it('viewer-only contractor grant matches read-only employee', () => {
    const viewer = {
      ...base,
      external: true,
      canView: true,
      canManage: false,
      canApprove: false,
      canManageLibrary: false,
      analysisApproved: false,
    };
    expect(resolveTakeoffPermissions(viewer)).toEqual(resolveTakeoffPermissions({ ...viewer, external: false }));
  });
});