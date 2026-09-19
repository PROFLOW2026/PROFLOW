/**
 * Workspaces domain types (UWM 0097).
 *
 * Workspace is the canonical work container.
 * Hierarchy: Org → Workspace → Board → Bucket → Task
 */

export type WorkspaceType = 'project_linked' | 'org_internal' | 'team';
export type WorkspaceVisibility = 'organization' | 'restricted' | 'team';
export type WorkspaceMemberAccessLevel = 'viewer' | 'contributor' | 'manager';

export interface Workspace {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly workspaceType: WorkspaceType;
  readonly workspaceVisibility: WorkspaceVisibility;
  readonly orgTeamId: string | null;
  readonly isArchived: boolean;
  readonly isReadOnly: boolean;
  readonly closedAt: Date | null;
  readonly createdByOrgMemberId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WorkspaceMember {
  readonly id: string;
  readonly workspaceId: string;
  readonly organizationId: string;
  readonly orgMemberId: string | null;
  readonly employeeId: string | null;
  readonly accessLevel: WorkspaceMemberAccessLevel;
  readonly addedAt: Date;
  readonly addedByOrgMemberId: string | null;
}

export interface ProjectWorkspaceLink {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly relationshipRole: string | null;
  readonly linkedAt: Date;
  readonly linkClosedAt: Date | null;
}

export interface OrgTeam {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly managerOrgMemberId: string | null;
  readonly isArchived: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrgTeamMember {
  readonly id: string;
  readonly orgTeamId: string;
  readonly organizationId: string;
  readonly orgMemberId: string | null;
  readonly employeeId: string | null;
  readonly addedAt: Date;
}

export interface WorkspaceDetail extends Workspace {
  readonly memberCount: number;
  readonly boardCount: number;
  readonly projectLinks: ProjectWorkspaceLink[];
}

export interface CreateWorkspaceInput {
  readonly name: string;
  readonly workspaceType: WorkspaceType;
  readonly workspaceVisibility?: WorkspaceVisibility;
  readonly orgTeamId?: string | null;
}

export interface UpdateWorkspaceInput {
  readonly name?: string;
  readonly workspaceVisibility?: WorkspaceVisibility;
  readonly isReadOnly?: boolean;
  readonly isArchived?: boolean;
}
