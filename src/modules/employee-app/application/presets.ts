import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import { defaultScopeForPermission } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';

export type EmployeePresetKey =
  | 'field_worker'
  | 'field_worker_time'
  | 'foreman'
  | 'project_manager'
  | 'office'
  | 'management'
  | 'custom';

export interface EmployeePresetGrant {
  readonly permissionKey: PermissionKey;
  readonly scope: PermissionScope;
}

export interface EmployeePreset {
  readonly key: EmployeePresetKey;
  readonly labelKey: string;
  readonly grants: readonly EmployeePresetGrant[];
  readonly documentCategories: readonly DocumentCategory[];
}

const FIELD_WORKER: EmployeePreset = {
  key: 'field_worker',
  labelKey: 'employeeApp.presets.fieldWorker',
  grants: [],
  documentCategories: [],
};

const FIELD_WORKER_TIME: EmployeePreset = {
  key: 'field_worker_time',
  labelKey: 'employeeApp.presets.fieldWorkerTime',
  grants: [{ permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' }],
  documentCategories: [],
};

const FOREMAN: EmployeePreset = {
  key: 'foreman',
  labelKey: 'employeeApp.presets.foreman',
  grants: [
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.ATTENDANCE_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FIELD_OPS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FIELD_OPS_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
  ],
  documentCategories: ['photo', 'drawing', 'other'],
};

const PROJECT_MANAGER: EmployeePreset = {
  key: 'project_manager',
  labelKey: 'employeeApp.presets.projectManager',
  grants: [
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PLANNING_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FIELD_OPS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FIELD_OPS_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_SUBMIT, scope: 'assigned_only' },
  ],
  documentCategories: ['photo', 'drawing', 'certificate', 'other'],
};

const OFFICE: EmployeePreset = {
  key: 'office',
  labelKey: 'employeeApp.presets.office',
  grants: [
    { permissionKey: PERMISSIONS.EXPENSES_CREATE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.EXPENSES_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_SUBMIT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
  ],
  documentCategories: ['receipt', 'invoice', 'photo', 'other'],
};

const MANAGEMENT: EmployeePreset = {
  key: 'management',
  labelKey: 'employeeApp.presets.management',
  grants: [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.ATTENDANCE_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.WORKFORCE_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TIME_APPROVE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.FIELD_OPS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'all_organization' },
  ],
  documentCategories: ['photo', 'drawing', 'certificate', 'contract', 'other'],
};

export const EMPLOYEE_PRESETS: readonly EmployeePreset[] = [
  FIELD_WORKER,
  FIELD_WORKER_TIME,
  FOREMAN,
  PROJECT_MANAGER,
  OFFICE,
  MANAGEMENT,
];

export function employeePreset(key: EmployeePresetKey): EmployeePreset {
  const preset = EMPLOYEE_PRESETS.find((candidate) => candidate.key === key);
  if (!preset) return FIELD_WORKER;
  return preset;
}

export function scopeForPresetPermission(
  permissionKey: PermissionKey,
  explicit?: PermissionScope,
): PermissionScope {
  return explicit ?? defaultScopeForPermission(permissionKey);
}
