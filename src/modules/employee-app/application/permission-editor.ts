import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { DOCUMENT_CATEGORIES } from '@/modules/documents/domain/categories';
import {
  EMPLOYEE_PRESETS,
  employeePreset,
  type EmployeePresetKey,
} from './presets';

export type EmployeeScopeOption = PermissionScope;

export interface EmployeePermissionEditorItem {
  readonly permissionKey: PermissionKey;
  /** i18n key under employeeApp.permissions.items */
  readonly labelKey: string;
  readonly scopes: readonly EmployeeScopeOption[];
}

export interface EmployeePermissionEditorGroup {
  readonly id: string;
  /** i18n key under employeeApp.permissions.groups */
  readonly labelKey: string;
  readonly items: readonly EmployeePermissionEditorItem[];
}

/** Permissions an owner may grant via Employee App (subset of catalog). */
export const EMPLOYEE_PERMISSION_EDITOR_GROUPS: readonly EmployeePermissionEditorGroup[] = [
  {
    id: 'attendance',
    labelKey: 'attendance',
    items: [
      {
        permissionKey: PERMISSIONS.ATTENDANCE_SELF,
        labelKey: 'attendanceSelf',
        scopes: ['self_only'],
      },
      {
        permissionKey: PERMISSIONS.ATTENDANCE_READ,
        labelKey: 'attendanceRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.ATTENDANCE_MANAGE,
        labelKey: 'attendanceManage',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'time',
    labelKey: 'time',
    items: [
      {
        permissionKey: PERMISSIONS.TIME_MANAGE,
        labelKey: 'timeManage',
        scopes: ['self_only', 'assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.TIME_APPROVE,
        labelKey: 'timeApprove',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'projects',
    labelKey: 'projects',
    items: [
      {
        permissionKey: PERMISSIONS.PROJECTS_READ,
        labelKey: 'projectsRead',
        scopes: ['assigned_only', 'granted_projects', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.PROJECTS_UPDATE,
        labelKey: 'projectsManage',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.PLANNING_READ,
        labelKey: 'planningRead',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'tasks',
    labelKey: 'tasks',
    items: [
      {
        permissionKey: PERMISSIONS.FIELD_OPS_READ,
        labelKey: 'tasksRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.FIELD_OPS_MANAGE,
        labelKey: 'tasksManage',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.SERVICE_READ,
        labelKey: 'serviceRead',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'documents',
    labelKey: 'documents',
    items: [
      {
        permissionKey: PERMISSIONS.DOCUMENTS_READ,
        labelKey: 'documentsRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.DOCUMENTS_MANAGE,
        labelKey: 'documentsManage',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'workforce',
    labelKey: 'workforce',
    items: [
      {
        permissionKey: PERMISSIONS.WORKFORCE_READ,
        labelKey: 'workforceRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.WORKFORCE_MANAGE,
        labelKey: 'workforceManage',
        scopes: ['all_organization'],
      },
      {
        permissionKey: PERMISSIONS.WORKFORCE_COST_READ,
        labelKey: 'workforceCostRead',
        scopes: ['all_organization'],
      },
    ],
  },
  {
    id: 'clients',
    labelKey: 'clients',
    items: [
      {
        permissionKey: PERMISSIONS.CLIENTS_READ,
        labelKey: 'clientsRead',
        scopes: ['all_organization'],
      },
      {
        permissionKey: PERMISSIONS.CLIENTS_MANAGE,
        labelKey: 'clientsManage',
        scopes: ['all_organization'],
      },
    ],
  },
  {
    id: 'vendors',
    labelKey: 'vendors',
    items: [
      {
        permissionKey: PERMISSIONS.VENDORS_READ,
        labelKey: 'vendorsRead',
        scopes: ['all_organization'],
      },
      {
        permissionKey: PERMISSIONS.VENDORS_MANAGE,
        labelKey: 'vendorsManage',
        scopes: ['all_organization'],
      },
    ],
  },
  {
    id: 'expenses',
    labelKey: 'expenses',
    items: [
      {
        permissionKey: PERMISSIONS.EXPENSES_READ,
        labelKey: 'expensesRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.EXPENSES_CREATE,
        labelKey: 'expensesCreate',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'financials',
    labelKey: 'financials',
    items: [
      {
        permissionKey: PERMISSIONS.PROJECT_FINANCIALS_READ,
        labelKey: 'projectFinancialsRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.BILLING_READ,
        labelKey: 'billingRead',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
  {
    id: 'forms',
    labelKey: 'forms',
    items: [
      {
        permissionKey: PERMISSIONS.FORMS_READ,
        labelKey: 'formsRead',
        scopes: ['assigned_only', 'all_organization'],
      },
      {
        permissionKey: PERMISSIONS.FORMS_SUBMIT,
        labelKey: 'formsSubmit',
        scopes: ['assigned_only', 'all_organization'],
      },
    ],
  },
];

export const EMPLOYEE_DOCUMENT_CATEGORY_KEYS: readonly DocumentCategory[] = DOCUMENT_CATEGORIES;

export function presetTranslationKey(key: EmployeePresetKey): string {
  const map: Record<EmployeePresetKey, string> = {
    field_worker: 'fieldWorker',
    field_worker_time: 'fieldWorkerTime',
    foreman: 'foreman',
    project_manager: 'projectManager',
    office: 'office',
    management: 'management',
    custom: 'custom',
  };
  return map[key];
}

export interface EditorGrantState {
  readonly permissionKey: PermissionKey;
  readonly scope: PermissionScope;
  readonly granted: boolean;
  /** Provided by employee role template — not persisted as a grant. */
  readonly roleBaseline?: boolean;
}

export function grantsMapFromPreset(key: EmployeePresetKey): Map<PermissionKey, EditorGrantState> {
  const preset = employeePreset(key);
  const map = new Map<PermissionKey, EditorGrantState>();
  for (const grant of preset.grants) {
    map.set(grant.permissionKey, {
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
    });
  }
  return map;
}

export function categoriesSetFromPreset(key: EmployeePresetKey): Set<DocumentCategory> {
  return new Set(employeePreset(key).documentCategories);
}

export function grantsMapFromRecords(
  records: ReadonlyArray<{ permissionKey: PermissionKey; scope: PermissionScope; granted: boolean }>,
  options?: { includeRoleBaseline?: boolean },
): Map<PermissionKey, EditorGrantState> {
  const map = new Map<PermissionKey, EditorGrantState>();
  for (const record of records) {
    if (!record.granted) continue;
    map.set(record.permissionKey, {
      permissionKey: record.permissionKey,
      scope: record.scope,
      granted: true,
    });
  }
  if (options?.includeRoleBaseline && !map.has(PERMISSIONS.ATTENDANCE_SELF)) {
    map.set(PERMISSIONS.ATTENDANCE_SELF, {
      permissionKey: PERMISSIONS.ATTENDANCE_SELF,
      scope: 'self_only',
      granted: true,
      roleBaseline: true,
    });
  }
  return map;
}

export function categoriesSetFromRecords(
  categories: ReadonlyMap<DocumentCategory, boolean>,
): Set<DocumentCategory> {
  const set = new Set<DocumentCategory>();
  for (const [category, allowed] of categories) {
    if (allowed) set.add(category);
  }
  return set;
}

export function detectPresetFromState(
  grants: Map<PermissionKey, EditorGrantState>,
  categories: Set<DocumentCategory>,
): EmployeePresetKey {
  const explicitGrants = new Map<PermissionKey, EditorGrantState>();
  for (const [key, value] of grants) {
    if (value.roleBaseline) continue;
    explicitGrants.set(key, value);
  }

  for (const preset of EMPLOYEE_PRESETS) {
    if (preset.key === 'custom') continue;
    const expectedGrants = grantsMapFromPreset(preset.key);
    const expectedCategories = categoriesSetFromPreset(preset.key);
    if (explicitGrants.size !== expectedGrants.size) continue;
    if (categories.size !== expectedCategories.size) continue;
    let grantsMatch = true;
    for (const [key, value] of expectedGrants) {
      const current = explicitGrants.get(key);
      if (!current?.granted || current.scope !== value.scope) {
        grantsMatch = false;
        break;
      }
    }
    if (!grantsMatch) continue;
    let categoriesMatch = true;
    for (const cat of expectedCategories) {
      if (!categories.has(cat)) {
        categoriesMatch = false;
        break;
      }
    }
    if (categoriesMatch) return preset.key;
  }
  return 'custom';
}

export function editorItemForPermission(
  permissionKey: PermissionKey,
): EmployeePermissionEditorItem | undefined {
  for (const group of EMPLOYEE_PERMISSION_EDITOR_GROUPS) {
    const item = group.items.find((candidate) => candidate.permissionKey === permissionKey);
    if (item) return item;
  }
  return undefined;
}

export function buildSaveGrantsPayload(
  grants: Map<PermissionKey, EditorGrantState>,
): Array<{ permissionKey: PermissionKey; scope: PermissionScope; granted: boolean }> {
  const payload: Array<{ permissionKey: PermissionKey; scope: PermissionScope; granted: boolean }> =
    [];
  for (const state of grants.values()) {
    if (!state.granted || state.roleBaseline) continue;
    payload.push({
      permissionKey: state.permissionKey,
      scope: state.scope,
      granted: true,
    });
  }
  return payload;
}
