/**
 * Workspace access resolution helpers.
 *
 * Rules:
 * - WORKSPACES_MANAGE → full access to all workspaces
 * - organization-visibility workspaces → any member can view
 * - restricted/team workspaces → only explicit workspace members can view
 * - mutation requires WORKSPACES_MANAGE or workspace membership with 'manager' access level
 */

import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { Workspace, WorkspaceMember } from './types';

export type WorkspaceScope = 'full' | 'member_only' | 'none';

/**
 * Returns true when the caller can view the given workspace.
 */
export function canViewWorkspace(
  context: OrgContext,
  workspace: Workspace,
  membership: WorkspaceMember | null,
): boolean {
  if (hasPermission(context, PERMISSIONS.WORKSPACES_MANAGE)) return true;
  if (workspace.workspaceVisibility === 'organization') return true;
  return membership !== null;
}

/**
 * Returns true when the caller can mutate the given workspace (rename, close, archive, manage members).
 */
export function canMutateWorkspace(
  context: OrgContext,
  _workspace: Workspace,
  membership: WorkspaceMember | null,
): boolean {
  if (hasPermission(context, PERMISSIONS.WORKSPACES_MANAGE)) return true;
  return membership?.accessLevel === 'manager';
}

/**
 * Returns the caller's scope across all workspaces.
 * - 'full'        → sees all workspaces (managers/admins)
 * - 'member_only' → sees only workspaces they are members of (+ org-visible)
 * - 'none'        → no task access at all
 */
export function getWorkspaceScope(context: OrgContext): WorkspaceScope {
  if (hasPermission(context, PERMISSIONS.WORKSPACES_MANAGE)) return 'full';
  if (hasPermission(context, PERMISSIONS.TASKS_READ)) return 'member_only';
  return 'none';
}
