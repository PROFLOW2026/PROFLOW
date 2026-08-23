import { describe, expect, it } from 'vitest';
import {
  buildQuickCreateActions,
  listAvailableCreateWorkKinds,
  pinDefaultWorkKindFirst,
  quickCreateKeyForWorkKind,
} from '@/components/shell/quick-create-actions';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ModuleVisibility, SuggestedBusinessDefaults } from '@/modules/tenancy';
import { OPTIONAL_MODULE_KEYS } from '@/modules/tenancy/domain/types';

function modules(overrides: Partial<ModuleVisibility> = {}): ModuleVisibility {
  return {
    ...(Object.fromEntries(OPTIONAL_MODULE_KEYS.map((key) => [key, false])) as ModuleVisibility),
    ...overrides,
  };
}

function defaults(defaultWorkKind: SuggestedBusinessDefaults['defaultWorkKind']): SuggestedBusinessDefaults {
  return { defaultWorkKind, preferServiceSurface: defaultWorkKind === 'work_order' };
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
    expect(keys).toContain('asset');
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
    expect(apOnly.map((a) => a.key)).toEqual(['vendorBill', 'recurringDrafts']);

    const attendanceReadOnly = buildQuickCreateActions(
      new Set([PERMISSIONS.ATTENDANCE_READ]),
      modules(),
      'projects',
    );
    expect(attendanceReadOnly.some((a) => a.key === 'attendance')).toBe(false);
  });

  it('maps profile defaultWorkKind to the matching Quick Create key', () => {
    expect(quickCreateKeyForWorkKind('project')).toBe('project');
    expect(quickCreateKeyForWorkKind('job')).toBe('job');
    expect(quickCreateKeyForWorkKind('work_order')).toBe('service');
  });

  it('pins the default work-type action first without dropping the others', () => {
    const actions = [{ key: 'expense' }, { key: 'project' }, { key: 'job' }, { key: 'service' }];
    expect(pinDefaultWorkKindFirst(actions, 'job').map((a) => a.key)).toEqual([
      'job',
      'expense',
      'project',
      'service',
    ]);
    expect(pinDefaultWorkKindFirst(actions, 'work_order').map((a) => a.key)).toEqual([
      'service',
      'expense',
      'project',
      'job',
    ]);
    expect(pinDefaultWorkKindFirst(actions, 'project').map((a) => a.key)).toEqual([
      'project',
      'expense',
      'job',
      'service',
    ]);
    expect(pinDefaultWorkKindFirst(actions, null).map((a) => a.key)).toEqual([
      'expense',
      'project',
      'job',
      'service',
    ]);
  });

  it('puts job first when the profile default is job, and keeps project reachable', () => {
    const actions = buildQuickCreateActions(
      new Set([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.EXPENSES_CREATE]),
      modules({ jobs: true }),
      'projects',
      ['expense', 'project', 'job'],
      defaults('job'),
    );
    const keys = actions.map((action) => action.key);
    expect(keys[0]).toBe('job');
    expect(keys).toContain('project');
    expect(keys).toContain('expense');
  });

  it('puts service first when the profile default is work_order and the module is on', () => {
    const actions = buildQuickCreateActions(
      new Set([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.SERVICE_MANAGE, PERMISSIONS.EXPENSES_CREATE]),
      modules({ jobs: true, service: true }),
      'mixed',
      ['job', 'expense', 'service'],
      defaults('work_order'),
    );
    const keys = actions.map((action) => action.key);
    expect(keys[0]).toBe('service');
    expect(keys).toContain('job');
    expect(keys).toContain('project');
  });

  it('does not invent a service action when the module or permission is missing', () => {
    const noModule = buildQuickCreateActions(
      new Set([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.SERVICE_MANAGE]),
      modules({ jobs: true }),
      'jobs',
      null,
      defaults('work_order'),
    );
    expect(noModule.map((a) => a.key)).toEqual(['job', 'project']);

    const noPermission = buildQuickCreateActions(
      new Set([PERMISSIONS.PROJECTS_CREATE]),
      modules({ jobs: true, service: true }),
      'jobs',
      null,
      defaults('work_order'),
    );
    expect(noPermission.some((a) => a.key === 'service')).toBe(false);
    expect(noPermission.map((a) => a.key)[0]).toBe('job');
  });

  it('surfaces job create when the profile default is job even on a projects-first mix', () => {
    const actions = buildQuickCreateActions(
      new Set([PERMISSIONS.PROJECTS_CREATE]),
      modules(),
      'projects',
      null,
      defaults('job'),
    );
    expect(actions.map((a) => a.key)).toEqual(['job', 'project']);
  });

  it('lists create-page work-type options without trapping mixed orgs', () => {
    const mixed = listAvailableCreateWorkKinds(
      new Set([PERMISSIONS.PROJECTS_CREATE, PERMISSIONS.SERVICE_MANAGE]),
      modules({ jobs: true, service: true }),
      'mixed',
      defaults('job'),
    );
    expect(mixed.map((option) => option.kind)).toEqual(['project', 'job', 'work_order']);

    const projectsOnly = listAvailableCreateWorkKinds(
      new Set([PERMISSIONS.PROJECTS_CREATE]),
      modules(),
      'projects',
      defaults('project'),
    );
    expect(projectsOnly.map((option) => option.kind)).toEqual(['project']);
  });
});
