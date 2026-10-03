import { randomUUID } from 'node:crypto';
import { insertWorkPackage, listWorkPackagesForProjects } from '@/modules/projects';
import { loadProjectCapabilities } from '@/modules/project-team';
import { createTask, ensureDefaultProjectBoard } from '@/modules/tasks';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { EMPTY_CHARACTERISTICS } from '../domain/characteristics';
import { STANDARD_PROFILE } from '../domain/profile';
import {
  RULESET_VERSION,
  applyDecisions,
  recommend,
  selectAcceptable,
  type Recommendation,
  type RecommendationDecisionRef,
  type RecommendationTarget,
  type RecommendationWithStatus,
} from '../domain/recommendations';
import { findCharacteristics, findDeliveryProfile } from '../data/profile.repository';
import {
  deleteDismissedDecisions,
  insertRecommendationDecisions,
  insertRecommendedMilestones,
  listRecommendationDecisions,
} from '../data/recommendations.repository';
import { recommendationKeysSchema, type RecommendationKeysInput } from '../validation/schemas';
import { CAP, parseInput, requireProjectWith } from './authorize';

export interface ProjectRecommendationState {
  readonly rulesetVersion: string;
  readonly items: readonly RecommendationWithStatus[];
  readonly orphanDecisions: readonly RecommendationDecisionRef[];
}

/** Localized title for a recommendation (resolved by the caller from `projectProfile` messages). */
export type RecommendationTitleResolver = (recommendation: Recommendation) => string;

async function loadState(context: OrgContext, projectId: string): Promise<ProjectRecommendationState> {
  const profile = await findDeliveryProfile(context.db, context.organizationId, projectId);
  const characteristics = await findCharacteristics(context.db, context.organizationId, projectId);
  const decisions = await listRecommendationDecisions(context.db, context.organizationId, projectId);
  const recommendations = recommend({
    profile: profile ?? STANDARD_PROFILE,
    characteristics: characteristics ?? EMPTY_CHARACTERISTICS,
  });
  const { items, orphanDecisions } = applyDecisions(recommendations, decisions);
  return { rulesetVersion: RULESET_VERSION, items, orphanDecisions };
}

export async function listProjectRecommendations(
  context: OrgContext,
  projectId: string,
): Promise<ProjectRecommendationState> {
  await requireProjectWith(context, projectId, CAP.VIEW);
  return loadState(context, projectId);
}

export interface AcceptRecommendationsResult {
  readonly accepted: readonly { key: string; createdEntityType: RecommendationTarget; createdEntityId: string }[];
}

/**
 * Accepts open recommendations by creating NON-financial records through existing modules:
 * work packages (projects), milestones (project_milestones), tasks (tasks module).
 * Never creates contracts, commitments, budgets or payments. Keys are re-evaluated on the
 * server - the client only chooses which current recommendations to accept.
 */
export async function acceptRecommendations(
  context: OrgContext,
  rawInput: RecommendationKeysInput,
  resolveTitle: RecommendationTitleResolver,
): Promise<AcceptRecommendationsResult> {
  const input = parseInput(recommendationKeysSchema, rawInput);
  const project = await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const state = await loadState(context, input.projectId);
  const selected = selectAcceptable(state.items, input.keys);
  if (selected.length === 0) {
    throw new DomainRuleError('Nothing to accept', 'projectProfile.errors.nothingToAccept');
  }

  const held = await loadProjectCapabilities(context, input.projectId);
  const workPackageItems = selected.filter((item) => item.target === 'work_package');
  const milestoneItems = selected.filter((item) => item.target === 'project_milestone');
  const taskItems = selected.filter((item) => item.target === 'task');
  if (milestoneItems.length > 0 && !held.has(CAP.SCHEDULE)) throw new AuthorizationError(`project:${CAP.SCHEDULE}`);
  if (taskItems.length > 0) {
    if (!held.has(CAP.TASKS)) throw new AuthorizationError(`project:${CAP.TASKS}`);
    if (!hasPermission(context, PERMISSIONS.TASKS_CREATE)) throw new AuthorizationError(PERMISSIONS.TASKS_CREATE);
  }

  const created = new Map<string, { type: RecommendationTarget; id: string }>();

  if (workPackageItems.length > 0) {
    const existing = await listWorkPackagesForProjects(context.db, context.organizationId, [input.projectId]);
    let sortOrder = existing.reduce((max, pkg) => Math.max(max, pkg.sortOrder), -1) + 1;
    for (const item of workPackageItems) {
      const workPackage = await insertWorkPackage(context.db, {
        organizationId: context.organizationId,
        projectId: input.projectId,
        name: resolveTitle(item).slice(0, 200),
        sortOrder,
      });
      sortOrder += 1;
      created.set(item.key, { type: 'work_package', id: workPackage.id });
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.WORK_PACKAGE_CREATED,
        entityType: 'work_package',
        entityId: workPackage.id,
        after: { name: workPackage.name, projectId: input.projectId },
        metadata: { source: 'project_recommendation', recommendationKey: item.key },
      });
    }
  }

  if (milestoneItems.length > 0) {
    const ids = await insertRecommendedMilestones(
      context.db,
      context.organizationId,
      input.projectId,
      milestoneItems.map((item) => resolveTitle(item).slice(0, 200)),
    );
    for (const [index, item] of milestoneItems.entries()) {
      created.set(item.key, { type: 'project_milestone', id: ids[index]! });
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.MILESTONE_CREATED,
        entityType: 'project_milestone',
        entityId: ids[index]!,
        after: { name: resolveTitle(item), projectId: input.projectId },
        metadata: { source: 'project_recommendation', recommendationKey: item.key },
      });
    }
  }

  if (taskItems.length > 0) {
    const { workspace } = await lazyCreateProjectWorkspace(context, input.projectId, project.name);
    const board = await ensureDefaultProjectBoard(context, workspace.id, project.name);
    for (const item of taskItems) {
      const task = await createTask(context, {
        workspaceId: workspace.id,
        projectId: input.projectId,
        boardId: board?.id ?? null,
        title: resolveTitle(item).slice(0, 500),
        source: 'template',
      });
      created.set(item.key, { type: 'task', id: task.id });
    }
  }

  const decisionRows = selected.map((item) => ({
    id: randomUUID(),
    item,
    created: created.get(item.key)!,
  }));
  await insertRecommendationDecisions(
    context.db,
    decisionRows.map(({ id, item, created: entity }) => ({
      id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      recommendationKey: item.key,
      kind: item.kind,
      decision: 'accepted' as const,
      rulesetVersion: RULESET_VERSION,
      createdEntityType: entity.type,
      createdEntityId: entity.id,
      decidedUserId: context.userId,
    })),
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_RECOMMENDATION_ACCEPTED,
    entityType: 'project',
    entityId: input.projectId,
    after: {
      rulesetVersion: RULESET_VERSION,
      accepted: decisionRows.map(({ item, created: entity }) => ({
        key: item.key,
        createdEntityType: entity.type,
        createdEntityId: entity.id,
      })),
    },
  });
  for (const { id, item, created: entity } of decisionRows) {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.PROFILE_RECOMMENDATION_ACCEPTED,
      entityType: 'project_recommendation',
      entityId: id,
      actor: internalActor(context.userId),
      payload: {
        recommendationKey: item.key,
        kind: item.kind,
        createdEntityType: entity.type,
        createdEntityId: entity.id,
      },
    });
  }

  return {
    accepted: decisionRows.map(({ item, created: entity }) => ({
      key: item.key,
      createdEntityType: entity.type,
      createdEntityId: entity.id,
    })),
  };
}

export async function dismissRecommendations(
  context: OrgContext,
  rawInput: RecommendationKeysInput,
): Promise<{ dismissedKeys: readonly string[] }> {
  const input = parseInput(recommendationKeysSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const state = await loadState(context, input.projectId);
  const selected = selectAcceptable(state.items, input.keys);
  if (selected.length === 0) {
    throw new DomainRuleError('Nothing to dismiss', 'projectProfile.errors.nothingToDismiss');
  }
  const rows = selected.map((item) => ({ id: randomUUID(), item }));
  await insertRecommendationDecisions(
    context.db,
    rows.map(({ id, item }) => ({
      id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      recommendationKey: item.key,
      kind: item.kind,
      decision: 'dismissed' as const,
      rulesetVersion: RULESET_VERSION,
      createdEntityType: null,
      createdEntityId: null,
      decidedUserId: context.userId,
    })),
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_RECOMMENDATION_DISMISSED,
    entityType: 'project',
    entityId: input.projectId,
    after: { keys: selected.map((item) => item.key) },
  });
  for (const { id, item } of rows) {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.PROFILE_RECOMMENDATION_DISMISSED,
      entityType: 'project_recommendation',
      entityId: id,
      actor: internalActor(context.userId),
      payload: { recommendationKey: item.key, kind: item.kind },
    });
  }
  return { dismissedKeys: selected.map((item) => item.key) };
}

/** Brings dismissed recommendations back to "open". Accepted decisions can never be undone here. */
export async function restoreRecommendations(
  context: OrgContext,
  rawInput: RecommendationKeysInput,
): Promise<{ restoredKeys: readonly string[] }> {
  const input = parseInput(recommendationKeysSchema, rawInput);
  await requireProjectWith(context, input.projectId, CAP.MANAGE);
  const restoredKeys = await deleteDismissedDecisions(
    context.db,
    context.organizationId,
    input.projectId,
    input.keys,
  );
  if (restoredKeys.length === 0) {
    throw new DomainRuleError('Nothing to restore', 'projectProfile.errors.nothingToRestore');
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_RECOMMENDATION_RESTORED,
    entityType: 'project',
    entityId: input.projectId,
    after: { keys: restoredKeys },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.PROFILE_RECOMMENDATION_RESTORED,
    entityType: 'project',
    entityId: input.projectId,
    actor: internalActor(context.userId),
    payload: { recommendationKeys: restoredKeys },
  });
  return { restoredKeys };
}
