import { withExecutor, type OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { NotFoundError } from '@/shared/errors';
import { sqlState } from './action-errors';
import {
  findProjectSummary,
  hasActiveMembershipForUser,
  listActiveMembershipsForUser,
  listProjectMembers,
  listTeamCandidates,
  type ProjectMemberListItem,
  type ProjectSummaryRow,
} from '../data/project-team.repository';
import {
  PROJECT_CAPABILITIES,
  isFinancialCapability,
  isProjectCapability,
  type ProjectCapability,
} from '../domain/capabilities';
import { PROJECT_CAPABILITY_TEMPLATES, expandTemplate } from '../domain/templates';
import type { TeamTemplateOption } from '../domain/views';
import { assertProjectCapability, isOrgProjectAdmin, loadProjectCapabilities } from './capability-guard';

export interface MyProjectMembership {
  readonly memberId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectDocumentNumber: string | null;
  readonly projectStatus: string;
  readonly title: string | null;
  readonly templateKey: string | null;
  readonly capabilityCount: number;
  readonly hasFinancialAccess: boolean;
  readonly canManageTeam: boolean;
}

/**
 * Projects where the current user is an ACTIVE project member (Owner app and
 * Employee App alike). Org-wide `project_team.admin` holders are not listed per
 * project - they already reach every project.
 */
export async function listMyProjectMemberships(context: OrgContext): Promise<MyProjectMembership[]> {
  const rows = await listActiveMembershipsForUser(context.db, context.organizationId, context.userId);
  return rows.map((row) => {
    const capabilities = row.capabilities.filter(isProjectCapability);
    return {
      memberId: row.memberId,
      projectId: row.projectId,
      projectName: row.projectName,
      projectDocumentNumber: row.projectDocumentNumber,
      projectStatus: row.projectStatus,
      title: row.title,
      templateKey: row.templateKey,
      capabilityCount: capabilities.length,
      hasFinancialAccess: capabilities.some(isFinancialCapability),
      canManageTeam: capabilities.includes(PROJECT_CAPABILITIES.PROJECT_TEAM_MANAGE),
    };
  });
}

/**
 * For existing surfaces that add a memberships section (Employee App projects list):
 * runs in a savepoint and degrades to `[]` only while migration 0154 is not applied
 * (undefined_table), so the host page keeps working.
 */
export async function listMyProjectMembershipsOrEmpty(context: OrgContext): Promise<MyProjectMembership[]> {
  try {
    return await withTransaction(context.db, (tx) => listMyProjectMemberships(withExecutor(context, tx)));
  } catch (error) {
    if (sqlState(error) === '42P01') return [];
    throw error;
  }
}

/** Cheap navigation probe (one indexed row); same pre-0154 degradation as above. */
export async function hasActiveProjectMembership(context: OrgContext): Promise<boolean> {
  try {
    return await withTransaction(context.db, (tx) =>
      hasActiveMembershipForUser(tx, context.organizationId, context.userId),
    );
  } catch (error) {
    if (sqlState(error) === '42P01') return false;
    throw error;
  }
}

export interface TeamCandidate {
  readonly userId: string;
  readonly name: string;
  readonly secondary: string | null;
}

export interface ProjectTeamPageData {
  readonly project: ProjectSummaryRow;
  readonly members: readonly ProjectMemberListItem[];
  readonly viewer: {
    readonly userId: string;
    readonly isOrgAdmin: boolean;
    readonly canManage: boolean;
    readonly capabilities: readonly ProjectCapability[];
  };
  /** Empty unless the viewer may manage the team. */
  readonly candidates: readonly TeamCandidate[];
  readonly templates: readonly TeamTemplateOption[];
}

/** Everything the team screen needs, in one org transaction. Requires `project.view`. */
export async function loadProjectTeamPage(
  context: OrgContext,
  projectId: string,
): Promise<ProjectTeamPageData> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  const project = await findProjectSummary(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const held = await loadProjectCapabilities(context, projectId);
  const canManage = held.has(PROJECT_CAPABILITIES.PROJECT_TEAM_MANAGE);

  const members = await listProjectMembers(context.db, context.organizationId, projectId);
  const candidateRows = canManage
    ? await listTeamCandidates(context.db, context.organizationId, projectId)
    : [];

  return {
    project,
    members,
    viewer: {
      userId: context.userId,
      isOrgAdmin: isOrgProjectAdmin(context),
      canManage,
      capabilities: [...held].sort(),
    },
    candidates: candidateRows.map((row) => {
      const name = row.displayName?.trim() || row.employeeName?.trim() || row.email;
      const secondary = row.jobTitle?.trim() || (name === row.email ? null : row.email);
      return { userId: row.userId, name, secondary };
    }),
    templates: PROJECT_CAPABILITY_TEMPLATES.map((template) => ({
      key: template.key,
      financialAccess: template.financialAccess,
      capabilities: expandTemplate(template.key),
    })),
  };
}
