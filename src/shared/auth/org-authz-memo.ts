import 'server-only';
import { cache } from 'react';
import type { DbExecutor } from '@/shared/db/types';
import type { OrgContext, OrganizationSummary } from '@/shared/auth/context';
import type { PermissionKey } from '@/shared/permissions/catalog';

/**
 * Authz fields that are safe to reuse within a single RSC/action request.
 *
 * Never includes `db` — RLS identity is transaction-scoped (`SET LOCAL`), so a
 * fresh executor must be attached for every `withUserContext` call.
 * Never caches financial or domain payloads.
 */
export type OrgAuthzSnapshot = {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly organization: OrganizationSummary;
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly roleKeys: readonly string[];
};

/** Per-request map: React `cache` resets between requests; keys always include org id. */
export const getRequestOrgAuthzMemo = cache(
  (): Map<string, OrgAuthzSnapshot> => new Map(),
);

export function orgAuthzMemoKey(
  userId: string,
  organizationId: string,
  locale: string,
): string {
  return `${userId}\0${organizationId}\0${locale}`;
}

export function toOrgAuthzSnapshot(context: OrgContext): OrgAuthzSnapshot {
  return {
    organizationId: context.organizationId,
    membershipId: context.membershipId,
    organization: context.organization,
    permissions: context.permissions,
    roleKeys: context.roleKeys,
  };
}

export function orgContextFromAuthzSnapshot(
  snapshot: OrgAuthzSnapshot,
  parts: { userId: string; locale: string; db: DbExecutor },
): OrgContext {
  return {
    userId: parts.userId,
    organizationId: snapshot.organizationId,
    membershipId: snapshot.membershipId,
    organization: snapshot.organization,
    permissions: snapshot.permissions,
    roleKeys: snapshot.roleKeys,
    db: parts.db,
    locale: parts.locale,
  };
}
