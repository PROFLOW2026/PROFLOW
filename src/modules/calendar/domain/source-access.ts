import type { ModuleVisibility } from '@/modules/tenancy/domain/types';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DatedCalendarSource } from './types';

export interface CalendarSourceAccess {
  readonly hasPermission: (permission: PermissionKey) => boolean;
  readonly modules: ModuleVisibility;
}

function allowed(
  access: CalendarSourceAccess,
  permission: PermissionKey,
  moduleKey: keyof ModuleVisibility,
): boolean {
  return Boolean(access.modules[moduleKey]) && access.hasPermission(permission);
}

/** Whether dated sources of this kind may be loaded for the calendar (U08). */
export function canIncludeCalendarSourceKind(
  access: CalendarSourceAccess,
  kind: DatedCalendarSource['kind'],
): boolean {
  switch (kind) {
    case 'follow_up':
      return allowed(access, PERMISSIONS.CRM_READ, 'crm');
    case 'compliance':
      return allowed(access, PERMISSIONS.COMPLIANCE_READ, 'compliance');
    case 'maintenance':
      return allowed(access, PERMISSIONS.ASSETS_READ, 'assets');
    case 'inspection':
      return allowed(access, PERMISSIONS.FIELD_OPS_READ, 'field_ops');
    case 'work_order':
      return allowed(access, PERMISSIONS.SERVICE_READ, 'service');
    case 'assignment':
      return allowed(access, PERMISSIONS.WORKFORCE_READ, 'workforce');
    case 'milestone':
    case 'warranty':
      return access.hasPermission(PERMISSIONS.PROJECTS_READ);
    case 'task':
      return (
        Boolean(access.modules.work_management) && access.hasPermission(PERMISSIONS.TASKS_READ)
      );
    default:
      return true;
  }
}

/** Static href templates used by calendar sources — must match real app routes (LEAD-CAL-04). */
export const CALENDAR_SOURCE_HREF_TEMPLATES: readonly { kind: string; pattern: RegExp }[] = [
  { kind: 'work_order', pattern: /^\/projects\/[0-9a-f-]{36}$/i },
  { kind: 'inspection', pattern: /^\/projects\/[0-9a-f-]{36}$/i },
  { kind: 'milestone', pattern: /^\/projects\/[0-9a-f-]{36}$/i },
  { kind: 'planning', pattern: /^\/projects\/[0-9a-f-]{36}\?tab=schedule$/i },
  { kind: 'assignment', pattern: /^\/projects\/[0-9a-f-]{36}\?tab=team$/i },
  { kind: 'maintenance', pattern: /^\/assets$/ },
  { kind: 'warranty', pattern: /^\/warranty$/ },
  { kind: 'compliance', pattern: /^\/compliance$/ },
  { kind: 'follow_up', pattern: /^\/crm\/opportunities\/[0-9a-f-]{36}$/i },
  { kind: 'task', pattern: /^\/work\?task=[0-9a-f-]{36}$/i },
];
