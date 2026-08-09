import 'server-only';
import { cache } from 'react';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { getSupabaseUser, isSupabaseConfigured } from '@/shared/supabase/server';
import { isDatabaseConfigured, withUserContext } from '@/shared/db/client';
import type { OrgContext, AuthenticatedUser, OrganizationSummary } from '@/shared/auth/context';
import {
  ensureProfile,
  getActiveOrganizationPreference,
  setActiveOrganizationPreference,
} from '@/modules/identity';
import { getModuleVisibility, listMembershipsForUser, resolveOrgContext } from '@/modules/tenancy';
import { AuthenticationRequiredError, AppError } from '@/shared/errors';

/**
 * Server-side session and tenant resolution (docs 72 §5, 73 §4).
 *
 * Everything the app renders for a signed-in user flows through here, which is
 * what keeps "is this person allowed to see this organization?" a single
 * answered question rather than a per-page decision.
 */

export type SessionState =
  | { status: 'unconfigured' }
  | { status: 'anonymous' }
  | {
      status: 'authenticated';
      user: AuthenticatedUser;
      memberships: (OrganizationSummary & { membershipId: string })[];
      activeOrganizationId: string | null;
    };

/**
 * Cached per request: a page and its layout both need the session, and neither
 * should trigger a second round trip to the auth server.
 */
export const getSessionState = cache(async (): Promise<SessionState> => {
  if (!isSupabaseConfigured() || !isDatabaseConfigured()) return { status: 'unconfigured' };

  const authUser = await getSupabaseUser();
  if (!authUser?.email) return { status: 'anonymous' };

  return withUserContext(authUser.id, async (tx) => {
    const user = await ensureProfile(tx, {
      id: authUser.id,
      email: authUser.email!,
      displayName:
        (authUser.user_metadata?.display_name as string | undefined) ??
        (authUser.user_metadata?.full_name as string | undefined) ??
        null,
    });

    const memberships = await listMembershipsForUser(tx, authUser.id);
    const preferred = await getActiveOrganizationPreference(tx, authUser.id);

    // A stale preference (membership removed, org archived) must not strand the
    // user on a dead tenant, so fall back to whatever they can still reach.
    const active =
      memberships.find((membership) => membership.id === preferred)?.id ?? memberships[0]?.id ?? null;

    return { status: 'authenticated', user, memberships, activeOrganizationId: active } as const;
  });
});

export async function requireSession(): Promise<
  Extract<SessionState, { status: 'authenticated' }>
> {
  const session = await getSessionState();

  if (session.status === 'unconfigured') redirect({ href: '/setup', locale: await getLocale() });
  if (session.status === 'anonymous') redirect({ href: '/sign-in', locale: await getLocale() });

  return session as Extract<SessionState, { status: 'authenticated' }>;
}

/**
 * Runs `fn` inside a transaction bound to the acting user, with a verified
 * `OrgContext`.
 *
 * The context has to be built inside the transaction because the RLS identity
 * is set with `SET LOCAL`; handing out a context whose executor outlives the
 * transaction would silently produce unfiltered queries.
 */
export async function withOrgContext<T>(fn: (context: OrgContext) => Promise<T>): Promise<T> {
  const session = await requireSession();

  if (!session.activeOrganizationId) {
    redirect({ href: '/onboarding', locale: await getLocale() });
  }

  return runInOrgContext(session.user.id, session.activeOrganizationId!, fn);
}

/** Same as `withOrgContext` but for an organization named explicitly in the URL. */
export async function withOrgContextFor<T>(
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const session = await requireSession();
  return runInOrgContext(session.user.id, organizationId, fn);
}

async function runInOrgContext<T>(
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const locale = await getLocale();

  return withUserContext(userId, async (tx) => {
    const context = await resolveOrgContext(tx, { userId, organizationId, locale });
    return fn(context);
  });
}

/** Switches the remembered organization after re-checking membership. */
export async function setActiveOrganization(organizationId: string): Promise<void> {
  const session = await requireSession();

  const allowed = session.memberships.some((membership) => membership.id === organizationId);
  if (!allowed) throw new AuthenticationRequiredError();

  await withUserContext(session.user.id, async (tx) => {
    await setActiveOrganizationPreference(tx, session.user.id, organizationId);
  });
}

/**
 * Read-only slice of the context used by the app shell — organization name,
 * permissions, role keys and which optional modules are in play. Cached so the
 * sidebar, top bar and page body share one resolution instead of each opening
 * its own transaction.
 */
export const getShellContext = cache(async () => {
  const session = await getSessionState();
  if (session.status !== 'authenticated' || !session.activeOrganizationId) return null;

  try {
    return await runInOrgContext(session.user.id, session.activeOrganizationId, async (context) => ({
      user: session.user,
      memberships: session.memberships,
      organization: context.organization,
      organizationId: context.organizationId,
      permissions: context.permissions,
      roleKeys: context.roleKeys,
      modules: await getModuleVisibility(context),
    }));
  } catch (error) {
    // A revoked membership should show the org picker, not an error page.
    if (error instanceof AppError) return null;
    throw error;
  }
});

export type ShellContext = NonNullable<Awaited<ReturnType<typeof getShellContext>>>;
