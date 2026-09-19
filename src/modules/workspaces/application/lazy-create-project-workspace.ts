import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import {
  insertWorkspace,
  findProjectWorkspaceLink,
  insertProjectWorkspaceLink,
  findWorkspaceIdsByProject,
} from '../data/workspaces.repository';
import type { ProjectWorkspaceLink, Workspace } from '../domain/types';

export interface LazyCreateResult {
  readonly workspace: Workspace;
  readonly link: ProjectWorkspaceLink;
  readonly created: boolean;
}

/**
 * Lazily creates a default 'project_linked' workspace for a project on first board access.
 *
 * Idempotent: if the project already has a linked workspace, returns the first
 * existing link without creating duplicates.
 *
 * Called by: board access paths (Agent B) when workspace_id is unknown.
 *
 * Note: Does NOT assert any permission — callers must already hold TASKS_READ or better.
 * The workspace creation is system-driven (project onboarding), not user-initiated.
 */
export async function lazyCreateProjectWorkspace(
  context: OrgContext,
  projectId: string,
  projectName: string,
): Promise<LazyCreateResult> {
  return withTransaction(context.db, async (tx) => {
    // Check if project already has a workspace link
    const existingIds = await findWorkspaceIdsByProject(tx, projectId);
    if (existingIds.length > 0) {
      const workspaceId = existingIds[0]!;
      const { findWorkspaceById } = await import('../data/workspaces.repository');
      const workspace = await findWorkspaceById(tx, context.organizationId, workspaceId);
      if (workspace) {
        const link = await findProjectWorkspaceLink(tx, workspaceId, projectId);
        return { workspace, link: link!, created: false };
      }
    }

    // Create the workspace
    const workspace = await insertWorkspace(tx, {
      organizationId: context.organizationId,
      name: projectName,
      workspaceType: 'project_linked',
      workspaceVisibility: 'organization',
      orgTeamId: null,
      createdByOrgMemberId: context.membershipId,
    });

    // Link the project
    const link = await insertProjectWorkspaceLink(tx, {
      workspaceId: workspace.id,
      projectId,
      relationshipRole: null,
    });

    return { workspace, link, created: true };
  });
}
