import { describe, expect, it } from 'vitest';
import {
  buildQuickCreateActions,
  listAvailableCreateWorkKinds,
  pinDefaultWorkKindFirst,
  quickCreateKeyForWorkKind,
} from '@/components/shell/quick-create-actions';
import { CANONICAL_QUICK_CREATE_KEYS } from '@/modules/tenancy';
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

const OWNER_CREATE_PERMISSIONS = new Set([
  PERMISSIONS.PROJECTS_CREATE,
  PERMISSIONS.EXPENSES_CREATE,
  PERMISSIONS.QUOTES_MANAGE,
  PERMISSIONS.CLIENTS_MANAGE,
  PERMISSIONS.VENDORS_MANAGE,
  PERMISSIONS.BILLING_MANAGE,
  PERMISSIONS.WORKFORCE_MANAGE,
  PERMISSIONS.TIME_MANAGE,
  PERMISSIONS.CHANGES_MANAGE,
  PERMISSIONS.FIELD_OPS_MANAGE,
  PERMISSIONS.DOCUMENTS_MANAGE,
  PERMISSIONS.SERVICE_MANAGE,
]);

const OWNER_MODULES = modules({
  changes: true,
  quotes: true,
  billing: true,
  clients: true,
  vendors: true,
  field_ops: true,
  service: true,
  jobs: true,
});

describe('buildQuickCreateActions', () => {
  it('returns the Owner canonical 13-item menu in fixed order for full access', () => {
    const desktop = buildQuickCreateActions(
      OWNER_CREATE_PERMISSIONS,
      OWNER_MODULES,
      'mixed',
      null,
      null,
      'all',
    );
    const mobile = buildQuickCreateActions(
      OWNER_CREATE_PERMISSIONS,
      OWNER_MODULES,
      'mixed',
      null,
      null,
      'project_contractor',
    );

    const expected = [...CANONICAL_QUICK_CREATE_KEYS];
    expect(desktop.map((action) => action.key)).toEqual(expected);
    expect(mobile.map((action) => action.key)).toEqual(expected);
    expect(desktop[0]?.key).toBe('quickCapture');
  });

  it('never exposes non-canonical Quick Create actions', () => {
    const actions = buildQuickCreateActions(
      new Set([
        ...OWNER_CREATE_PERMISSIONS,
        PERMISSIONS.AP_MANAGE,
        PERMISSIONS.ATTENDANCE_MANAGE,
        PERMISSIONS.ASSETS_MANAGE,
      ]),
      modules({
        changes: true,
        quotes: true,
        billing: true,
        clients: true,
        vendors: true,
        field_ops: true,
        service: true,
        assets: true,
        jobs: true,
      }),
      'mixed',
    );
    const keys = actions.map((action) => action.key);
    expect(keys).not.toContain('payment');
    expect(keys).not.toContain('asset');
    expect(keys).not.toContain('vendorBill');
    expect(keys).not.toContain('attendance');
    expect(keys).not.toContain('recurringDrafts');
    for (const key of keys) {
      expect(CANONICAL_QUICK_CREATE_KEYS).toContain(key);
    }
  });

  it('gates canonical items by permission and module without adding extras', () => {
    const none = buildQuickCreateActions(new Set([PERMISSIONS.PROJECTS_READ]), modules(), 'projects');
    expect(none.map((a) => a.key)).toEqual([]);

    const fieldWithoutModule = buildQuickCreateActions(
      new Set([PERMISSIONS.FIELD_OPS_MANAGE]),
      modules({ field_ops: false }),
      'projects',
    );
    expect(fieldWithoutModule.some((a) => a.key === 'fieldLog')).toBe(false);

    const apOnly = buildQuickCreateActions(new Set([PERMISSIONS.AP_MANAGE]), modules(), 'projects');
    expect(apOnly.map((a) => a.key)).toEqual([]);

    const attendanceOnly = buildQuickCreateActions(
      new Set([PERMISSIONS.ATTENDANCE_MANAGE]),
      modules(),
      'projects',
    );
    expect(attendanceOnly.some((a) => a.key === 'attendance')).toBe(false);
  });

  it('ignores persona and emphasis reordering', () => {
    const contractor = buildQuickCreateActions(
      OWNER_CREATE_PERMISSIONS,
      OWNER_MODULES,
      'mixed',
      ['expense', 'job', 'project'],
      defaults('job'),
      'project_contractor',
    );
    const all = buildQuickCreateActions(
      OWNER_CREATE_PERMISSIONS,
      OWNER_MODULES,
      'mixed',
      ['expense', 'job', 'project'],
      defaults('job'),
      'all',
    );
    expect(contractor.map((action) => action.key)).toEqual(all.map((action) => action.key));
    expect(all[0]?.key).toBe('quickCapture');
    expect(all.map((action) => action.key)).toEqual([...CANONICAL_QUICK_CREATE_KEYS]);
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
  });

  it('hides quickCapture when DOCUMENTS_MANAGE is missing', () => {
    const withoutDocuments = buildQuickCreateActions(
      new Set([
        PERMISSIONS.PROJECTS_CREATE,
        PERMISSIONS.EXPENSES_CREATE,
        PERMISSIONS.QUOTES_MANAGE,
        PERMISSIONS.FIELD_OPS_MANAGE,
      ]),
      modules({ jobs: true, quotes: true, field_ops: true }),
      'jobs',
      null,
      null,
      'electrical',
    );
    expect(withoutDocuments.some((action) => action.key === 'quickCapture')).toBe(false);
    expect(withoutDocuments[0]?.key).toBe('project');
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
