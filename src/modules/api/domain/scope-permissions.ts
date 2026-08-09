import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { API_KEY_SCOPES, type ApiKeyScope } from './types';

/**
 * API key scopes map 1:1 onto UI permission keys where possible so Bearer auth
 * cannot grant more than the equivalent session permission.
 * `webhooks.manage` is the API-facing alias for `api.manage`.
 */
const SCOPE_TO_PERMISSION: Readonly<Record<ApiKeyScope, PermissionKey>> = {
  'projects.read': PERMISSIONS.PROJECTS_READ,
  'clients.read': PERMISSIONS.CLIENTS_READ,
  'billing.read': PERMISSIONS.BILLING_READ,
  'webhooks.manage': PERMISSIONS.API_MANAGE,
};

const PERMISSION_TO_SCOPE = new Map<PermissionKey, ApiKeyScope>(
  (Object.entries(SCOPE_TO_PERMISSION) as [ApiKeyScope, PermissionKey][]).map(
    ([scope, permission]) => [permission, scope],
  ),
);

export function permissionForApiScope(scope: ApiKeyScope): PermissionKey {
  return SCOPE_TO_PERMISSION[scope];
}

export function apiScopeForPermission(permission: PermissionKey): ApiKeyScope | null {
  return PERMISSION_TO_SCOPE.get(permission) ?? null;
}

export function permissionsForApiScopes(scopes: readonly string[]): ReadonlySet<PermissionKey> {
  const set = new Set<PermissionKey>();
  for (const scope of scopes) {
    if ((API_KEY_SCOPES as readonly string[]).includes(scope)) {
      set.add(SCOPE_TO_PERMISSION[scope as ApiKeyScope]);
    }
  }
  return set;
}

/** True when every requested scope has a known UI-permission equivalent. */
export function apiScopesArePermissionEquivalent(scopes: readonly string[]): boolean {
  return (
    scopes.length > 0 &&
    scopes.every((scope) => (API_KEY_SCOPES as readonly string[]).includes(scope))
  );
}
