/**
 * Workspaces module public API.
 *
 * Import from here — never reach into sub-paths directly from outside this module.
 */

// Domain types
export type {
  Workspace,
  WorkspaceType,
  WorkspaceVisibility,
  WorkspaceMember,
  WorkspaceMemberAccessLevel,
  ProjectWorkspaceLink,
  OrgTeam,
  OrgTeamMember,
  WorkspaceDetail,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
} from './domain/types';

// Domain helpers
export { canViewWorkspace, canMutateWorkspace, getWorkspaceScope } from './domain/access';
export type { WorkspaceScope } from './domain/access';

// Application functions
export { createWorkspace } from './application/create-workspace';
export { updateWorkspace } from './application/update-workspace';
export { listWorkspaces } from './application/list-workspaces';
export type { ListWorkspacesOptions } from './application/list-workspaces';
export { getWorkspaceDetail } from './application/get-workspace-detail';
export {
  addWorkspaceMember,
  removeWorkspaceMember,
  updateMemberAccessLevel,
  getWorkspaceMembers,
} from './application/manage-workspace-members';
export { linkProjectToWorkspace, unlinkProject } from './application/link-project-workspace';
export { lazyCreateProjectWorkspace } from './application/lazy-create-project-workspace';
export type { LazyCreateResult } from './application/lazy-create-project-workspace';

// Data repository (for other modules that need raw queries)
export {
  findWorkspaceById,
  findWorkspaceIdsByActor,
  findWorkspaceIdsByProject,
  findProjectWorkspaceLink,
  listProjectWorkspaceLinksByWorkspace,
  listProjectWorkspaceLinksByProject,
  listWorkspacesForOrg,
} from './data/workspaces.repository';
