import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import { defaultScopeForPermission } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';

export type EmployeePresetKey =
  | 'field_worker'
  | 'field_worker_time'
  | 'technical_professional'
  | 'professional_employee'
  | 'foreman'
  | 'team_lead'
  | 'project_manager'
  | 'office_admin'
  | 'office'
  | 'management'
  | 'read_only_project'
  | 'external_consultant'
  | 'supervisor_inspector'
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

function preset(
  key: EmployeePresetKey,
  labelKey: string,
  grants: readonly EmployeePresetGrant[],
  documentCategories: readonly DocumentCategory[] = [],
): EmployeePreset {
  return { key, labelKey, grants, documentCategories };
}

const FIELD_WORKER = preset('field_worker', 'employeeApp.presets.fieldWorker', [
  { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
  { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
  { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'self_only' },
]);

const FIELD_WORKER_TIME = preset('field_worker_time', 'employeeApp.presets.fieldWorkerTime', [
  { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
]);

const TECHNICAL_PROFESSIONAL = preset(
  'technical_professional',
  'employeeApp.presets.technicalProfessional',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'self_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
  ],
  ['photo', 'drawing', 'other'],
);

const PROFESSIONAL_EMPLOYEE = preset(
  'professional_employee',
  'employeeApp.presets.professionalEmployee',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PLANNING_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
  ],
  ['photo', 'drawing', 'certificate', 'other'],
);

const FOREMAN = preset(
  'foreman',
  'employeeApp.presets.foreman',
  [
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.ATTENDANCE_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_CREATE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_ASSIGN, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.WORKFORCE_READ, scope: 'assigned_only' },
  ],
  ['photo', 'drawing', 'other'],
);

const TEAM_LEAD = preset(
  'team_lead',
  'employeeApp.presets.teamLead',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_CREATE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_MANAGE_ALL, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_ASSIGN, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.WORKFORCE_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.ATTENDANCE_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
  ],
  ['photo', 'drawing', 'other'],
);

const PROJECT_MANAGER = preset(
  'project_manager',
  'employeeApp.presets.projectManager',
  [
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.PLANNING_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_MANAGE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_SUBMIT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_CREATE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_MANAGE_ALL, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_ASSIGN, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_APPROVE, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.WORKFORCE_READ, scope: 'assigned_only' },
  ],
  ['photo', 'drawing', 'certificate', 'other'],
);

const OFFICE_ADMIN = preset(
  'office_admin',
  'employeeApp.presets.officeAdmin',
  [
    { permissionKey: PERMISSIONS.EXPENSES_CREATE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.EXPENSES_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.FORMS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.FORMS_SUBMIT, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'self_only' },
    { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
  ],
  ['receipt', 'invoice', 'photo', 'other'],
);

const MANAGEMENT = preset(
  'management',
  'employeeApp.presets.management',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_CREATE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_MANAGE_ALL, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_ASSIGN, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_APPROVE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.WORKFORCE_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.ATTENDANCE_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.TIME_MANAGE, scope: 'self_only' },
    { permissionKey: PERMISSIONS.TIME_APPROVE, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'all_organization' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'all_organization' },
  ],
  ['photo', 'drawing', 'certificate', 'contract', 'other'],
);

const READ_ONLY_PROJECT = preset(
  'read_only_project',
  'employeeApp.presets.readOnlyProject',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'assigned_only' },
  ],
  ['photo', 'drawing', 'other'],
);

const EXTERNAL_CONSULTANT = preset(
  'external_consultant',
  'employeeApp.presets.externalConsultant',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'granted_projects' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'granted_projects' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'granted_projects' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'granted_projects' },
    { permissionKey: PERMISSIONS.MEETINGS_READ, scope: 'granted_projects' },
  ],
  ['drawing', 'certificate', 'other'],
);

const SUPERVISOR_INSPECTOR = preset(
  'supervisor_inspector',
  'employeeApp.presets.supervisorInspector',
  [
    { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.TASKS_COMMENT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_READ, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.FORMS_SUBMIT, scope: 'assigned_only' },
    { permissionKey: PERMISSIONS.DOCUMENTS_READ, scope: 'assigned_only' },
  ],
  ['photo', 'certificate', 'other'],
);

const CUSTOM: EmployeePreset = {
  key: 'custom',
  labelKey: 'employeeApp.presets.custom',
  grants: [],
  documentCategories: [],
};

export const EMPLOYEE_PRESETS: readonly EmployeePreset[] = [
  FIELD_WORKER,
  FIELD_WORKER_TIME,
  TECHNICAL_PROFESSIONAL,
  PROFESSIONAL_EMPLOYEE,
  FOREMAN,
  TEAM_LEAD,
  PROJECT_MANAGER,
  OFFICE_ADMIN,
  { ...OFFICE_ADMIN, key: 'office', labelKey: 'employeeApp.presets.office' },
  MANAGEMENT,
  READ_ONLY_PROJECT,
  EXTERNAL_CONSULTANT,
  SUPERVISOR_INSPECTOR,
  CUSTOM,
];

export function employeePreset(key: EmployeePresetKey): EmployeePreset {
  if (key === 'custom') return CUSTOM;
  if (key === 'office') return { ...OFFICE_ADMIN, key: 'office', labelKey: 'employeeApp.presets.office' };
  const found = EMPLOYEE_PRESETS.find((candidate) => candidate.key === key);
  if (!found) return FIELD_WORKER;
  return found;
}

export function scopeForPresetPermission(
  permissionKey: PermissionKey,
  explicit?: PermissionScope,
): PermissionScope {
  return explicit ?? defaultScopeForPermission(permissionKey);
}
