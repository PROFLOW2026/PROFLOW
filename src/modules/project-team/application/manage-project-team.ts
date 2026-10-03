import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import { z } from 'zod';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { emitDomainEvent } from '@/shared/domain-events';
import { PROJECT_TEAM_DOMAIN_EVENTS } from '@/shared/domain-events/events/project-team';
import type { OrgContext } from '@/shared/auth/context';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  type ValidationIssue,
} from '@/shared/errors';
import { findActiveMembership } from '@/modules/tenancy';
import {
  findProjectMember,
  insertProjectMember,
  listProjectMembers,
  replaceProjectMemberCapabilities,
  updateProjectMemberRow,
  type ProjectMemberListItem,
} from '../data/project-team.repository';
import {
  PROJECT_CAPABILITIES,
  expandCapabilities,
  isProjectCapability,
} from '../domain/capabilities';
import { capabilitiesBeyondGrantor } from '../domain/resolve';
import {
  expandTemplate,
  isProjectTemplateKey,
  type ProjectTemplateKey,
} from '../domain/templates';
import { assertProjectCapability, loadProjectCapabilities } from './capability-guard';

const capabilityList = z
  .array(z.string().trim().min(1))
  .max(64)
  .refine((values) => values.every(isProjectCapability), 'Unknown project capability');

const addMemberSchema = z
  .object({
    projectId: z.string().uuid(),
    userId: z.string().uuid(),
    title: z.string().trim().max(120).optional().nullable(),
    templateKey: z.string().trim().optional().nullable(),
    capabilities: capabilityList.optional(),
  })
  .refine(
    (value) => Boolean(value.templateKey) || (value.capabilities?.length ?? 0) > 0,
    { message: 'Choose a template or at least one capability', path: ['capabilities'] },
  );

const setCapabilitiesSchema = z.object({
  projectId: z.string().uuid(),
  memberId: z.string().uuid(),
  templateKey: z.string().trim().optional().nullable(),
  capabilities: capabilityList.optional(),
  title: z.string().trim().max(120).optional().nullable(),
});

async function emitMemberEvent(
  context: OrgContext,
  type: (typeof PROJECT_TEAM_DOMAIN_EVENTS)[keyof typeof PROJECT_TEAM_DOMAIN_EVENTS],
  member: { projectId: string; memberId: string; userId: string },
): Promise<void> {
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: member.projectId,
    type,
    entityType: 'project_member',
    entityId: member.memberId,
    actor: internalActor(context.userId),
    payload: { projectId: member.projectId, memberId: member.memberId, userId: member.userId },
  });
}

function issues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

async function assertProjectInOrganization(context: OrgContext, projectId: string): Promise<void> {
  const [project] = await context.db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, context.organizationId)))
    .limit(1);
  if (!project) throw new NotFoundError('Project');
}

function resolveRequestedCapabilities(input: {
  templateKey?: string | null;
  capabilities?: readonly string[];
}): { templateKey: ProjectTemplateKey | null; capabilities: string[] } {
  let templateKey: ProjectTemplateKey | null = null;
  if (input.templateKey) {
    if (!isProjectTemplateKey(input.templateKey)) {
      throw new ValidationError([{ path: 'templateKey', message: 'Unknown capability template' }]);
    }
    templateKey = input.templateKey;
  }
  const requested = new Set<string>(input.capabilities ?? []);
  if (templateKey) for (const capability of expandTemplate(templateKey)) requested.add(capability);
  // Stored pre-expanded so the DB mirror `app.has_project_capability` is an existence check.
  return { templateKey, capabilities: [...expandCapabilities(requested)].sort() };
}

async function assertCanGrant(
  context: OrgContext,
  projectId: string,
  requested: readonly string[],
): Promise<void> {
  const grantor = await loadProjectCapabilities(context, projectId);
  const beyond = capabilitiesBeyondGrantor(grantor, requested);
  if (beyond.length > 0) {
    throw new AuthorizationError(`project:grant:${beyond.join(',')}`);
  }
}

export async function listProjectTeam(
  context: OrgContext,
  projectId: string,
): Promise<ProjectMemberListItem[]> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
  await assertProjectInOrganization(context, projectId);
  return listProjectMembers(context.db, context.organizationId, projectId);
}

export async function addProjectMember(
  context: OrgContext,
  raw: z.input<typeof addMemberSchema>,
): Promise<{ memberId: string; capabilities: string[] }> {
  const parsed = addMemberSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(issues(parsed.error));
  const input = parsed.data;

  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.PROJECT_TEAM_MANAGE);
  await assertProjectInOrganization(context, input.projectId);

  const membership = await findActiveMembership(context.db, context.organizationId, input.userId);
  if (!membership) {
    throw new ValidationError([
      { path: 'userId', message: 'Only active organization members (including employees) can join a project team' },
    ]);
  }

  const existing = await findProjectMember(
    context.db,
    context.organizationId,
    input.projectId,
    input.userId,
  );
  if (existing) {
    throw new ConflictError('This person is already on the project team', 'projectTeam.errors.alreadyMember');
  }

  const resolved = resolveRequestedCapabilities(input);
  await assertCanGrant(context, input.projectId, resolved.capabilities);

  const memberId = await insertProjectMember(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    userId: input.userId,
    title: input.title?.trim() || null,
    templateKey: resolved.templateKey,
    addedByUserId: context.userId,
  });
  await replaceProjectMemberCapabilities(context.db, {
    organizationId: context.organizationId,
    memberId,
    current: [],
    next: resolved.capabilities,
    grantedByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_MEMBER_ADDED,
    entityType: 'project_member',
    entityId: memberId,
    after: {
      projectId: input.projectId,
      userId: input.userId,
      templateKey: resolved.templateKey,
      capabilities: resolved.capabilities,
    },
  });
  await emitMemberEvent(context, PROJECT_TEAM_DOMAIN_EVENTS.MEMBER_ADDED, {
    projectId: input.projectId,
    memberId,
    userId: input.userId,
  });
  return { memberId, capabilities: resolved.capabilities };
}

/**
 * Replaces a member's capability set. Anti-escalation both ways: the actor must hold
 * every capability being granted, and may not strip capabilities they do not hold
 * (a non-financial PM cannot silently remove the accountant's financial access).
 */
export async function setProjectMemberCapabilities(
  context: OrgContext,
  raw: z.input<typeof setCapabilitiesSchema>,
): Promise<{ added: string[]; removed: string[] }> {
  const parsed = setCapabilitiesSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError(issues(parsed.error));
  const input = parsed.data;

  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.PROJECT_TEAM_MANAGE);
  await assertProjectInOrganization(context, input.projectId);

  const members = await listProjectMembers(context.db, context.organizationId, input.projectId);
  const member = members.find((candidate) => candidate.id === input.memberId);
  if (!member) throw new NotFoundError('Project member');

  const resolved = resolveRequestedCapabilities(input);
  if (resolved.capabilities.length === 0) {
    throw new ValidationError([{ path: 'capabilities', message: 'A member needs at least one capability' }]);
  }
  const grantor = await loadProjectCapabilities(context, input.projectId);
  const nextSet = new Set(resolved.capabilities);
  const stripped = member.capabilities.filter((capability) => !nextSet.has(capability));
  const strippedBeyond = capabilitiesBeyondGrantor(grantor, stripped).filter(
    (capability) => stripped.includes(capability),
  );
  if (strippedBeyond.length > 0) {
    throw new AuthorizationError(`project:revoke:${strippedBeyond.join(',')}`);
  }
  await assertCanGrant(
    context,
    input.projectId,
    resolved.capabilities.filter((capability) => !member.capabilities.includes(capability)),
  );

  const diff = await replaceProjectMemberCapabilities(context.db, {
    organizationId: context.organizationId,
    memberId: member.id,
    current: member.capabilities,
    next: resolved.capabilities,
    grantedByUserId: context.userId,
  });
  await updateProjectMemberRow(context.db, context.organizationId, member.id, {
    templateKey: resolved.templateKey ?? member.templateKey,
    ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_MEMBER_CAPABILITIES_CHANGED,
    entityType: 'project_member',
    entityId: member.id,
    before: { capabilities: member.capabilities },
    after: { capabilities: resolved.capabilities, added: diff.added, removed: diff.removed },
  });
  if (diff.added.length > 0 || diff.removed.length > 0) {
    await emitMemberEvent(context, PROJECT_TEAM_DOMAIN_EVENTS.MEMBER_CAPABILITIES_CHANGED, {
      projectId: input.projectId,
      memberId: member.id,
      userId: member.userId,
    });
  }
  return diff;
}

export async function setProjectMemberStatus(
  context: OrgContext,
  input: { projectId: string; memberId: string; active: boolean },
): Promise<void> {
  await assertProjectCapability(context, input.projectId, PROJECT_CAPABILITIES.PROJECT_TEAM_MANAGE);
  await assertProjectInOrganization(context, input.projectId);

  const members = await listProjectMembers(context.db, context.organizationId, input.projectId);
  const member = members.find((candidate) => candidate.id === input.memberId);
  if (!member) throw new NotFoundError('Project member');

  if (input.active) {
    await assertCanGrant(context, input.projectId, member.capabilities);
  } else {
    // Deactivating someone with authority the actor lacks would be a silent revocation.
    const grantor = await loadProjectCapabilities(context, input.projectId);
    if (capabilitiesBeyondGrantor(grantor, member.capabilities).length > 0) {
      throw new AuthorizationError('project:deactivate-higher-authority');
    }
  }

  await updateProjectMemberRow(context.db, context.organizationId, member.id, {
    status: input.active ? 'active' : 'inactive',
    endedAt: input.active ? null : new Date(),
  });
  await recordAuditEvent(context, {
    action: input.active
      ? AUDIT_ACTIONS.PROJECT_MEMBER_REACTIVATED
      : AUDIT_ACTIONS.PROJECT_MEMBER_DEACTIVATED,
    entityType: 'project_member',
    entityId: member.id,
    after: { projectId: input.projectId, userId: member.userId },
  });
  await emitMemberEvent(
    context,
    input.active ? PROJECT_TEAM_DOMAIN_EVENTS.MEMBER_REACTIVATED : PROJECT_TEAM_DOMAIN_EVENTS.MEMBER_DEACTIVATED,
    { projectId: input.projectId, memberId: member.id, userId: member.userId },
  );
}
