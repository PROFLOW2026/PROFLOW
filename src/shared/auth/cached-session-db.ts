import 'server-only';
import { unstable_cache } from 'next/cache';
import type { AuthenticatedUser, OrganizationSummary } from '@/shared/auth/context';
import { withUserContext } from '@/shared/db/client';
import {
  ensureProfile,
  getActiveOrganizationPreference,
} from '@/modules/identity';
import { listMembershipsForUser } from '@/modules/tenancy';
import { localeFromAuthMetadata } from '@/shared/i18n/auth-locale';

export type SessionDbSnapshot = {
  readonly user: AuthenticatedUser;
  readonly memberships: (OrganizationSummary & { membershipId: string })[];
  readonly preferredOrganizationId: string | null;
};

export function sessionDbCacheTag(userId: string): string {
  return `session-db:${userId}`;
}

export function loadCachedSessionDb(input: {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly metadata: Record<string, unknown> | undefined;
}): Promise<SessionDbSnapshot> {
  return unstable_cache(
    async () =>
      withUserContext(input.userId, async (tx) => {
        const user = await ensureProfile(tx, {
          id: input.userId,
          email: input.email,
          displayName: input.displayName,
          localePreference: localeFromAuthMetadata(input.metadata),
        });
        const memberships = await listMembershipsForUser(tx, input.userId);
        const preferred = await getActiveOrganizationPreference(tx, input.userId);
        return { user, memberships, preferredOrganizationId: preferred };
      }),
    ['session-db', input.userId],
    { revalidate: 45, tags: [sessionDbCacheTag(input.userId)] },
  )();
}
