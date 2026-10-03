import { randomUUID } from 'node:crypto';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import type { OrgContext } from '@/shared/auth/context';
import { withExecutor } from '@/shared/auth/context';
import { externalActor, internalActor } from '@/shared/actor';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { resolveEntityScope, type EntityScope } from '@/shared/entity-access';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES,
  externalGrantCovers,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import {
  PROJECT_CAPABILITIES,
  loadProjectCapabilities,
  type ProjectCapability,
} from '@/modules/project-team';
import {
  assertInternalAudienceAllowed,
  externalCanSeePost,
  isDiscussionAudience,
  normaliseCommentBody,
  resolveExternalPostVendor,
  type DiscussionAudience,
  type DiscussionKind,
} from '../domain/discussion';
import {
  insertCollabComment,
  listCollabComments,
  loadPrincipalNames,
  loadProfileNames,
  loadVendorNames,
} from '../data/collaboration.repository';
import { auditExternal, auditInternal } from './audit';

const C = PROJECT_CAPABILITIES;
const X = EXTERNAL_CAPABILITIES;

/** Capabilities that allow recording a formal decision on a project entity. */
export const DECISION_CAPABILITIES: readonly ProjectCapability[] = [
  C.PROJECT_MANAGE,
  C.CONTRACTOR_COORDINATE,
  C.TASKS_MANAGE,
  C.PROGRESS_VERIFY,
];

export interface EntityRefInput {
  readonly organizationId: string;
  readonly entityType: string;
  readonly entityId: string;
}

async function resolveInternalScope(context: OrgContext, ref: EntityRefInput): Promise<EntityScope> {
  if (ref.organizationId !== context.organizationId) throw new NotFoundError('Entity');
  const scope = await resolveEntityScope(context.db, ref.entityType, ref.organizationId, ref.entityId);
  if (!scope || scope.organizationId !== context.organizationId) throw new NotFoundError('Entity');
  return scope;
}

// ─── Posting ─────────────────────────────────────────────────────────────────

export interface PostInternalCommentInput extends EntityRefInput {
  readonly body: string;
  readonly audience: DiscussionAudience;
  /** 'decision' records a formal, audited decision (internal authors only). Default 'comment'. */
  readonly kind?: DiscussionKind;
}

export async function postInternalCommentUseCase(
  context: OrgContext,
  input: PostInternalCommentInput,
): Promise<{ readonly commentId: string }> {
  if (!isDiscussionAudience(input.audience)) {
    throw new ValidationError([{ path: 'audience', message: 'Unknown audience' }]);
  }
  const kind: DiscussionKind = input.kind === 'decision' ? 'decision' : 'comment';
  const body = normaliseCommentBody(input.body);
  const scope = await resolveInternalScope(context, input);
  if (scope.projectId) {
    const held = await loadProjectCapabilities(context, scope.projectId);
    if (!held.has(C.PROJECT_VIEW)) throw new NotFoundError('Entity');
    if (kind === 'decision' && !DECISION_CAPABILITIES.some((capability) => held.has(capability))) {
      throw new AuthorizationError(`project:${DECISION_CAPABILITIES.join('|')}`);
    }
  }
  assertInternalAudienceAllowed(scope, input.audience);

  const commentId = randomUUID();
  const actor = internalActor(context.userId);
  await withTransaction(context.db, async (tx) => {
    const ctx = withExecutor(context, tx);
    await insertCollabComment(tx, {
      id: commentId,
      organizationId: context.organizationId,
      projectId: scope.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      vendorId: scope.vendorId ?? null,
      subcontractAgreementId: scope.vendorId ? scope.subcontractAgreementId ?? null : null,
      audience: input.audience,
      kind,
      body,
      actor,
    });
    const payload = {
      commentId,
      entityType: input.entityType,
      entityId: input.entityId,
      audience: input.audience,
      kind,
      vendorId: scope.vendorId ?? undefined,
    };
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: scope.projectId,
      type: kind === 'decision' ? DOMAIN_EVENTS.COLLAB_DECISION_RECORDED : DOMAIN_EVENTS.COLLAB_COMMENT_POSTED,
      entityType: input.entityType,
      entityId: input.entityId,
      actor,
      payload,
    });
    await auditInternal(ctx, {
      action: kind === 'decision' ? AUDIT_ACTIONS.COLLAB_DECISION_RECORDED : AUDIT_ACTIONS.COLLAB_COMMENT_POSTED,
      entityType: input.entityType,
      entityId: input.entityId,
      // The decision text is part of the formal record; ordinary comment bodies stay out of the trail.
      after: kind === 'decision' ? { commentId, audience: input.audience, body } : { commentId, audience: input.audience },
    });
  });
  return { commentId };
}

/** Vendors the principal can post for on this entity (grant must cover entity scope + ext.thread.post). */
function postingGrants(context: ExternalContext, scope: EntityScope) {
  return context.grants.filter((grant) =>
    externalGrantCovers(
      grant,
      {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
        vendorId: scope.vendorId ?? grant.vendorId,
        subcontractAgreementId: scope.vendorId ? scope.subcontractAgreementId ?? null : grant.subcontractAgreementId,
      },
      X.THREAD_POST,
    ),
  );
}

export interface PostExternalCommentInput extends EntityRefInput {
  readonly body: string;
}

export async function postExternalCommentUseCase(
  context: ExternalContext,
  input: PostExternalCommentInput,
): Promise<{ readonly commentId: string }> {
  const body = normaliseCommentBody(input.body);
  const scope = await resolveEntityScope(context.db, input.entityType, input.organizationId, input.entityId);
  if (!scope || scope.internalOnly || scope.organizationId !== input.organizationId) throw new NotFoundError('Entity');

  const grants = postingGrants(context, scope);
  const vendorId = resolveExternalPostVendor(scope, [...new Set(grants.map((grant) => grant.vendorId))]);
  if (!vendorId) throw new AuthorizationError(`external:${X.THREAD_POST}`);
  const grant = grants.find((candidate) => candidate.vendorId === vendorId)!;
  const agreementId = scope.vendorId ? scope.subcontractAgreementId ?? null : grant.subcontractAgreementId;
  requireExternalScope(
    context,
    { organizationId: input.organizationId, projectId: scope.projectId, vendorId, subcontractAgreementId: agreementId },
    X.THREAD_POST,
  );

  const commentId = randomUUID();
  const actor = externalActor(context.principalId);
  await withTransaction(context.db, async (tx) => {
    await insertCollabComment(tx, {
      id: commentId,
      organizationId: input.organizationId,
      projectId: scope.projectId,
      entityType: input.entityType,
      entityId: input.entityId,
      vendorId,
      subcontractAgreementId: agreementId,
      audience: 'contractor',
      kind: 'comment',
      body,
      actor,
    });
    await emitDomainEvent(tx, {
      organizationId: input.organizationId,
      projectId: scope.projectId,
      type: DOMAIN_EVENTS.COLLAB_COMMENT_POSTED,
      entityType: input.entityType,
      entityId: input.entityId,
      actor,
      payload: {
        commentId,
        entityType: input.entityType,
        entityId: input.entityId,
        audience: 'contractor',
        kind: 'comment',
        vendorId,
      },
    });
    await auditExternal({ ...context, db: tx }, input.organizationId, {
      action: AUDIT_ACTIONS.COLLAB_COMMENT_POSTED,
      entityType: input.entityType,
      entityId: input.entityId,
      after: { commentId, audience: 'contractor', vendorId },
    });
  });
  return { commentId };
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export interface DiscussionPost {
  readonly id: string;
  readonly audience: DiscussionAudience;
  readonly kind: DiscussionKind;
  readonly body: string;
  readonly createdAt: string;
  readonly author: {
    readonly type: 'internal' | 'external' | 'system';
    readonly name: string | null;
    /** Contractor company of an external author (internal viewers only). */
    readonly vendorName: string | null;
    readonly isViewer: boolean;
  };
}

export interface DiscussionThread {
  readonly posts: readonly DiscussionPost[];
  readonly canPost: boolean;
  /** Internal viewers: entity is shared with contractors (contractor-audience posts allowed). */
  readonly contractorAudienceAllowed: boolean;
  readonly canRecordDecision: boolean;
  readonly projectId: string | null;
}

const THREAD_LIMIT = 200;

export async function loadInternalDiscussion(context: OrgContext, ref: EntityRefInput): Promise<DiscussionThread> {
  const scope = await resolveInternalScope(context, ref);
  let held: ReadonlySet<ProjectCapability> | null = null;
  if (scope.projectId) {
    held = await loadProjectCapabilities(context, scope.projectId);
    if (!held.has(C.PROJECT_VIEW)) throw new NotFoundError('Entity');
  }
  const rows = await listCollabComments(context.db, {
    organizationId: context.organizationId,
    entityType: ref.entityType,
    entityId: ref.entityId,
    limit: THREAD_LIMIT,
  });
  const [profileNames, principalNames, vendorNames] = await Promise.all([
    loadProfileNames(context.db, rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : []))),
    loadPrincipalNames(context.db, rows.flatMap((row) => (row.actorPrincipalId ? [row.actorPrincipalId] : []))),
    loadVendorNames(
      context.db,
      context.organizationId,
      rows.flatMap((row) => (row.actorType === 'external' && row.vendorId ? [row.vendorId] : [])),
    ),
  ]);
  return {
    posts: rows.map((row) => ({
      id: row.id,
      audience: row.audience,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: {
        type: row.actorType,
        name: row.actorUserId
          ? profileNames.get(row.actorUserId) ?? null
          : row.actorPrincipalId
            ? principalNames.get(row.actorPrincipalId) ?? null
            : null,
        vendorName: row.actorType === 'external' && row.vendorId ? vendorNames.get(row.vendorId) ?? null : null,
        isViewer: row.actorUserId === context.userId,
      },
    })),
    canPost: true,
    contractorAudienceAllowed: !scope.internalOnly,
    canRecordDecision: held ? DECISION_CAPABILITIES.some((capability) => held!.has(capability)) : false,
    projectId: scope.projectId,
  };
}

export async function loadExternalDiscussion(context: ExternalContext, ref: EntityRefInput): Promise<DiscussionThread> {
  const scope = await resolveEntityScope(context.db, ref.entityType, ref.organizationId, ref.entityId);
  if (!scope || scope.internalOnly || scope.organizationId !== ref.organizationId) throw new NotFoundError('Entity');
  const viewGrants = context.grants.filter((grant) =>
    externalGrantCovers(
      grant,
      {
        organizationId: ref.organizationId,
        projectId: scope.projectId,
        vendorId: scope.vendorId ?? grant.vendorId,
        subcontractAgreementId: scope.vendorId ? scope.subcontractAgreementId ?? null : grant.subcontractAgreementId,
      },
      X.PROJECT_VIEW,
    ),
  );
  if (viewGrants.length === 0) throw new NotFoundError('Entity');
  const vendorIds = [...new Set(viewGrants.map((grant) => grant.vendorId))];
  const rows = await listCollabComments(context.db, {
    organizationId: ref.organizationId,
    entityType: ref.entityType,
    entityId: ref.entityId,
    externalVendorIds: vendorIds,
    limit: THREAD_LIMIT,
  });
  const posts = rows.filter((row) =>
    externalCanSeePost(
      { audience: row.audience, vendorId: row.vendorId, actorType: row.actorType, actorPrincipalId: row.actorPrincipalId },
      vendorIds,
    ),
  );
  const canPost = postingGrants(context, scope).length > 0;
  return {
    posts: posts.map((row) => ({
      id: row.id,
      audience: row.audience,
      kind: row.kind,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      author: {
        type: row.actorType,
        // Contractors never see internal user identities; their own posts show their name.
        name: row.actorPrincipalId === context.principalId ? context.displayName : null,
        vendorName: null,
        isViewer: row.actorPrincipalId === context.principalId,
      },
    })),
    canPost,
    contractorAudienceAllowed: true,
    canRecordDecision: false,
    projectId: scope.projectId,
  };
}
