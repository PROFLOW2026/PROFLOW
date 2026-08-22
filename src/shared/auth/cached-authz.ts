import 'server-only';
import { unstable_cache } from 'next/cache';
import type { OrgAuthzSnapshot } from '@/shared/auth/org-authz-memo';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { withUserContext } from '@/shared/db/client';
import { resolveOrgContext } from '@/modules/tenancy';
import { toOrgAuthzSnapshot } from '@/shared/auth/org-authz-memo';

/** Serializable authz snapshot for cross-request cache (never includes `db`). */
type CachedOrgAuthz = {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly organization: OrgAuthzSnapshot['organization'];
  readonly permissions: readonly PermissionKey[];
  readonly roleKeys: readonly string[];
};

function serialize(snapshot: OrgAuthzSnapshot): CachedOrgAuthz {
  return {
    organizationId: snapshot.organizationId,
    membershipId: snapshot.membershipId,
    organization: snapshot.organization,
    permissions: [...snapshot.permissions],
    roleKeys: snapshot.roleKeys,
  };
}

export function deserializeCachedOrgAuthz(cached: CachedOrgAuthz): OrgAuthzSnapshot {
  return {
    organizationId: cached.organizationId,
    membershipId: cached.membershipId,
    organization: cached.organization,
    permissions: new Set(cached.permissions),
    roleKeys: cached.roleKeys,
  };
}

export function orgAuthzCacheTag(userId: string, organizationId: string): string {
  return `org-authz:${userId}:${organizationId}`;
}

/**
 * Membership + permissions verified inside a short RLS transaction, then cached
 * briefly. Financial payloads never pass through here.
 */
export function loadCachedOrgAuthz(
  userId: string,
  organizationId: string,
  locale: string,
): Promise<OrgAuthzSnapshot> {
  return unstable_cache(
    async (): Promise<CachedOrgAuthz> =>
      withUserContext(userId, async (tx) => {
        const context = await resolveOrgContext(tx, { userId, organizationId, locale });
        return serialize(toOrgAuthzSnapshot(context));
      }),
    ['org-authz', userId, organizationId, locale],
    { revalidate: 45, tags: [orgAuthzCacheTag(userId, organizationId)] },
  )().then(deserializeCachedOrgAuthz);
}
