/** Public API of the RBAC module (doc 76 §3). */
export {
  provisionOrganizationRoles,
  loadEffectivePermissions,
  listOrganizationRoles,
  listRolePermissions,
  findRoleByKey,
  assignRole,
  ensureRoleAssigned,
} from './data/roles.repository';
export { setRolePermissionToggle } from './application/manage-role-permissions';
export { assertCanGrantRole } from './application/assert-can-grant-role';
export { findEscalatingPermissions, isPermissionSubset } from './domain/permission-subset';
export type { RoleRow } from './data/roles.repository';
