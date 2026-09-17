/**
 * Data scope for employee permission grants (Employee App).
 */
export const PERMISSION_SCOPES = [
  'self_only',
  'assigned_only',
  'granted_projects',
  'all_organization',
] as const;

export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export function isPermissionScope(value: string): value is PermissionScope {
  return (PERMISSION_SCOPES as readonly string[]).includes(value);
}

/** Default scope per permission category for employee presets. */
export function defaultScopeForPermission(permissionKey: string): PermissionScope {
  if (permissionKey === 'attendance.self' || permissionKey === 'time.manage') {
    return 'self_only';
  }
  if (
    permissionKey.startsWith('projects.') ||
    permissionKey === 'field_ops.read' ||
    permissionKey === 'field_ops.manage' ||
    permissionKey === 'documents.read' ||
    permissionKey === 'documents.manage' ||
    permissionKey === 'planning.read' ||
    permissionKey === 'service.read'
  ) {
    return 'assigned_only';
  }
  return 'all_organization';
}
