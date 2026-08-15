/**
 * Project visibility modes stored in organization_settings.project_access_mode.
 * RLS `app.can_access_project` is the data-plane gate; this module mirrors it
 * in application code for PGlite tests and UI.
 *
 * Default remains `all` so existing tenants are unchanged.
 */

export const PROJECT_ACCESS_MODES = ['all', 'selected', 'assigned'] as const;
export type ProjectAccessMode = (typeof PROJECT_ACCESS_MODES)[number];

export const PROJECT_ACCESS_SETTING_KEY = 'project_access_mode';

export const PROJECT_ACCESS_LEVELS = ['read', 'manage'] as const;
export type ProjectAccessLevel = (typeof PROJECT_ACCESS_LEVELS)[number];

export function parseProjectAccessMode(raw: unknown): ProjectAccessMode {
  if (typeof raw === 'string' && (PROJECT_ACCESS_MODES as readonly string[]).includes(raw)) {
    return raw as ProjectAccessMode;
  }
  if (raw && typeof raw === 'object' && 'mode' in raw) {
    const mode = (raw as { mode?: unknown }).mode;
    if (typeof mode === 'string' && (PROJECT_ACCESS_MODES as readonly string[]).includes(mode)) {
      return mode as ProjectAccessMode;
    }
  }
  return 'all';
}

export function isProjectAccessMode(value: unknown): value is ProjectAccessMode {
  return typeof value === 'string' && (PROJECT_ACCESS_MODES as readonly string[]).includes(value);
}

/** Operational employee fields a project manager may see without compensation access. */
export const OPERATIONAL_EMPLOYEE_FIELDS = [
  'id',
  'name',
  'phone',
  'email',
  'jobTitle',
  'status',
  'employeeNumber',
] as const;

export type OperationalEmployeeField = (typeof OPERATIONAL_EMPLOYEE_FIELDS)[number];
