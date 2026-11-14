import { PROJECT_CAPABILITIES, assertProjectCapability, hasProjectCapability } from '@/modules/project-team';
import { AuthorizationError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, externalGrantCovers, type ExternalContext } from '@/shared/external';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import type { OrgContext } from '@/shared/auth/context';
import type { TakeoffPermissionFacts } from '../domain/permissions';
import { takeoffForbidden } from '../domain/errors';
import { findAnalysis } from '../data/takeoff.repository';

export type TakeoffActor =
  | { readonly kind: 'internal'; readonly context: OrgContext }
  | { readonly kind: 'external'; readonly context: ExternalContext };

export function internalActorFrom(context: OrgContext): TakeoffActor {
  return { kind: 'internal', context };
}

export function externalActorFrom(context: ExternalContext): TakeoffActor {
  return { kind: 'external', context };
}

export function takeoffOrgScope(actor: TakeoffActor): { db: OrgContext['db']; organizationId: string } {
  if (actor.kind === 'internal') {
    return { db: actor.context.db, organizationId: actor.context.organizationId };
  }
  const organizationId = actor.context.grants[0]?.organizationId;
  if (!organizationId) takeoffForbidden();
  return { db: actor.context.db, organizationId };
}

export async function authorizeTakeoffProject(actor: TakeoffActor, projectId: string, need: 'view' | 'manage'): Promise<void> {
  if (actor.kind === 'internal') {
    await assertProjectCapability(actor.context, projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
    assertPermission(actor.context, need === 'view' ? PERMISSIONS.TAKEOFF_VIEW : PERMISSIONS.TAKEOFF_MANAGE);
    return;
  }
  const cap = need === 'view' ? EXTERNAL_CAPABILITIES.TAKEOFF_VIEW : EXTERNAL_CAPABILITIES.TAKEOFF_MANAGE;
  const ok = actor.context.grants.some((g) => externalGrantCovers(g, { organizationId: g.organizationId, projectId, vendorId: g.vendorId, subcontractAgreementId: g.subcontractAgreementId }, cap));
  if (!ok) throw new AuthorizationError(`external:${cap}`);
}

export async function loadPermissionFacts(
  actor: TakeoffActor,
  input: {
    projectId: string;
    analysisApproved: boolean;
    persistenceMode: 'persistent' | 'ephemeral';
    canPickFromProjectCloud: boolean;
  },
): Promise<TakeoffPermissionFacts> {
  if (actor.kind === 'internal') {
    const ctx = actor.context;
  const projectView = await hasProjectCapability(ctx, input.projectId, PROJECT_CAPABILITIES.PROJECT_VIEW);
    return {
      external: false,
      canView: hasPermission(ctx, PERMISSIONS.TAKEOFF_VIEW) && projectView,
      canManage: hasPermission(ctx, PERMISSIONS.TAKEOFF_MANAGE) && projectView,
      canApprove: hasPermission(ctx, PERMISSIONS.TAKEOFF_APPROVE) && projectView,
      canManageLibrary: hasPermission(ctx, PERMISSIONS.TAKEOFF_LIBRARY_MANAGE),
      analysisApproved: input.analysisApproved,
      persistenceMode: input.persistenceMode,
      canPickFromProjectCloud: input.canPickFromProjectCloud,
    };
  }
  const g = actor.context;
  const covers = (cap: string) =>
    g.grants.some((grant) =>
      externalGrantCovers(
        grant,
        { organizationId: grant.organizationId, projectId: input.projectId, vendorId: grant.vendorId, subcontractAgreementId: grant.subcontractAgreementId },
        cap as (typeof EXTERNAL_CAPABILITIES)[keyof typeof EXTERNAL_CAPABILITIES],
      ),
    );
  return {
    external: true,
    canView: covers(EXTERNAL_CAPABILITIES.TAKEOFF_VIEW),
    canManage: covers(EXTERNAL_CAPABILITIES.TAKEOFF_MANAGE),
    canApprove: covers(EXTERNAL_CAPABILITIES.TAKEOFF_APPROVE),
    canManageLibrary: covers(EXTERNAL_CAPABILITIES.TAKEOFF_LIBRARY_MANAGE),
    analysisApproved: input.analysisApproved,
    persistenceMode: input.persistenceMode,
    canPickFromProjectCloud: false,
  };
}

export async function assertAnalysisAccess(actor: TakeoffActor, analysisId: string, need: 'view' | 'manage' | 'approve') {
  const orgId = actor.kind === 'internal' ? actor.context.organizationId : actor.context.grants[0]?.organizationId;
  if (!orgId) takeoffForbidden();
  const row = await findAnalysis(actor.kind === 'internal' ? actor.context.db : actor.context.db, orgId, analysisId);
  if (!row) takeoffForbidden();
  if (actor.kind === 'external' && row.vendorId) {
    const principal = actor.context.principalId;
    if (row.createdByPrincipalId !== principal) takeoffForbidden();
  }
  if (need === 'approve') {
    if (actor.kind === 'internal') assertPermission(actor.context, PERMISSIONS.TAKEOFF_APPROVE);
    else if (!actor.context.grants.some((g) => g.capabilities.has(EXTERNAL_CAPABILITIES.TAKEOFF_APPROVE))) takeoffForbidden();
  } else {
    await authorizeTakeoffProject(actor, row.projectId, need === 'manage' ? 'manage' : 'view');
  }
  return row;
}