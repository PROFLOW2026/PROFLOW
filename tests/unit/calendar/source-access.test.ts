import { describe, expect, it } from 'vitest';
import { canIncludeCalendarSourceKind } from '@/modules/calendar/domain/source-access';
import { OPTIONAL_MODULE_KEYS, type ModuleVisibility } from '@/modules/tenancy/domain/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function allModulesOn(): ModuleVisibility {
  return Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, true])) as ModuleVisibility;
}

function access(
  permissions: string[],
  modules: Partial<ModuleVisibility> = {},
): Parameters<typeof canIncludeCalendarSourceKind>[0] {
  const full = { ...allModulesOn(), ...modules };
  return {
    hasPermission: (key) => permissions.includes(key),
    modules: full,
  };
}

describe('canIncludeCalendarSourceKind (U08)', () => {
  it('blocks CRM, compliance, and maintenance for scheduling.read only', () => {
    const schedulingOnly = access([PERMISSIONS.SCHEDULING_READ]);
    expect(canIncludeCalendarSourceKind(schedulingOnly, 'follow_up')).toBe(false);
    expect(canIncludeCalendarSourceKind(schedulingOnly, 'compliance')).toBe(false);
    expect(canIncludeCalendarSourceKind(schedulingOnly, 'maintenance')).toBe(false);
  });

  it('allows CRM when module on and crm.read granted', () => {
    const withCrm = access([PERMISSIONS.SCHEDULING_READ, PERMISSIONS.CRM_READ]);
    expect(canIncludeCalendarSourceKind(withCrm, 'follow_up')).toBe(true);
  });

  it('hides CRM when module disabled even with permission', () => {
    const withCrmModuleOff = access([PERMISSIONS.CRM_READ], { crm: false });
    expect(canIncludeCalendarSourceKind(withCrmModuleOff, 'follow_up')).toBe(false);
  });

  it('requires work_management module for native tasks', () => {
    const tasksPerm = access([PERMISSIONS.TASKS_READ], { work_management: false });
    expect(canIncludeCalendarSourceKind(tasksPerm, 'task')).toBe(false);
    const tasksOn = access([PERMISSIONS.TASKS_READ], { work_management: true });
    expect(canIncludeCalendarSourceKind(tasksOn, 'task')).toBe(true);
  });
});
