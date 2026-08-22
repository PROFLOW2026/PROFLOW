import 'server-only';
import { cache } from 'react';
import { revalidateTag } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/shared/i18n/navigation';
import { getSupabaseUser, isSupabaseConfigured } from '@/shared/supabase/server';
import { isDatabaseConfigured, withUserContext } from '@/shared/db/client';
import type { AuthenticatedUser, OrgContext, OrganizationSummary } from '@/shared/auth/context';
import {
  getRequestOrgAuthzMemo,
  orgAuthzMemoKey,
  orgContextFromAuthzSnapshot,
} from '@/shared/auth/org-authz-memo';
import { loadCachedOrgAuthz, orgAuthzCacheTag } from '@/shared/auth/cached-authz';
import { loadCachedSessionDb, sessionDbCacheTag } from '@/shared/auth/cached-session-db';
import {
  getOrgRequestTxFrame,
  runInOrgRequestTxFrame,
  type OrgRequestTxFrame,
} from '@/shared/auth/org-request-tx';
import {
  setActiveOrganizationPreference,
} from '@/modules/identity';
import {
  applyComplexityToVisibility,
  dashboardCardsForPersona,
  getBusinessProfile,
  getModuleVisibility,
  loadShellOrgSettings,
  personaForBusinessProfile,
  resolveExperienceRoleSurface,
  type ModuleVisibility,
} from '@/modules/tenancy';
import { getShellOrgLogoUrl } from '@/modules/branding';
import {
  canUseExperiencePreview,
  resolveExperiencePreview,
} from '@/modules/tenancy/domain/experience-preview';
import { readExperiencePreviewCookie } from '@/modules/tenancy/application/experience-preview';
import { serverEnv } from '@/shared/env/server';
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

  const dbState = await loadCachedSessionDb({
    userId: authUser.id,
    email: authUser.email,
    displayName:
      (authUser.user_metadata?.display_name as string | undefined) ??
      (authUser.user_metadata?.full_name as string | undefined) ??
      null,
    metadata: authUser.user_metadata as Record<string, unknown> | undefined,
  });

  const active =
    dbState.memberships.find((membership) => membership.id === dbState.preferredOrganizationId)
      ?.id ??
    dbState.memberships[0]?.id ??
    null;

  return {
    status: 'authenticated',
    user: dbState.user,
    memberships: dbState.memberships,
    activeOrganizationId: active,
  } as const;
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

/**
 * Opens a fresh RLS-bound transaction for `fn`, but reuses membership /
 * permission / organization rows already resolved earlier in this request.
 *
 * AppShell (`getShellContext`) and page bodies (`withOrgContext`) previously
 * each re-ran `resolveOrgContext` (membership + org + effective permissions).
 * That work is identical within one navigation and is safe to memoize per
 * `(userId, organizationId, locale)` - never across requests or tenants, and
 * never for financial payloads.
 */
async function runInOrgContext<T>(
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  const nested = getOrgRequestTxFrame();
  const locale = await getLocale();

  if (nested) {
    return fn(
      orgContextFromAuthzSnapshot(nested.snapshot, {
        userId,
        locale,
        db: nested.tx,
      }),
    );
  }

  const memo = getRequestOrgAuthzMemo();
  const key = orgAuthzMemoKey(userId, organizationId, locale);
  const memoHit = memo.get(key);

  const snapshot =
    memoHit ?? (await loadCachedOrgAuthz(userId, organizationId, locale));
  if (!memoHit) {
    memo.set(key, snapshot);
  }

  return withUserContext(userId, async (tx) => {
    const frame: OrgRequestTxFrame = { tx: tx as OrgRequestTxFrame['tx'], snapshot };
    return runInOrgRequestTxFrame(frame, () =>
      fn(
        orgContextFromAuthzSnapshot(snapshot, {
          userId,
          locale,
          db: tx,
        }),
      ),
    );
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
  revalidateTag(sessionDbCacheTag(session.user.id), 'max');
  revalidateTag(orgAuthzCacheTag(session.user.id, organizationId), 'max');
}

/**
 * Read-only slice of the context used by the app shell - organization name,
 * permissions, role keys and which optional modules are in play. Cached so the
 * sidebar, top bar and page body share one resolution instead of each opening
 * its own transaction.
 */
export const getShellContext = cache(async () => {
  const session = await getSessionState();
  if (session.status !== 'authenticated' || !session.activeOrganizationId) return null;

  try {
    return await runInOrgContext(session.user.id, session.activeOrganizationId, async (context) => {
      const [modules, orgSettings, previewSelection, organizationLogoUrl] = await Promise.all([
        getModuleVisibility(context),
        loadShellOrgSettings(context.db, context.organizationId),
        readExperiencePreviewCookie(),
        getShellOrgLogoUrl(context).catch(() => null),
      ]);

      const {
        workMix,
        businessProfileKey,
        complexity,
        customizationMode,
      } = orgSettings;

      const env = serverEnv();
      const previewAllowed = canUseExperiencePreview(
        context.roleKeys,
        env.APP_ENV,
        env.PF_EXPERIENCE_PREVIEW,
      );
      const preview = resolveExperiencePreview(previewAllowed ? previewSelection : 'actual');

      const effectiveProfileKey =
        preview.active && preview.profileKey ? preview.profileKey : businessProfileKey;
      const persona = personaForBusinessProfile(effectiveProfileKey);
      const roleSurface = resolveExperienceRoleSurface(context.roleKeys);

      let resolvedModules: ModuleVisibility =
        preview.active && preview.modules ? preview.modules : modules;
      // Preview shows the selected profile's recommended surface at full depth so
      // Owner QA is not masked by the org's stored complexity setting.
      const complexityForSurface = preview.active ? 'full' : complexity;
      if (!preview.active && customizationMode === 'profile') {
        const recommended =
          getBusinessProfile(effectiveProfileKey)?.visibleModules ?? [];
        resolvedModules = applyComplexityToVisibility(
          resolvedModules,
          recommended,
          complexityForSurface,
          persona,
          customizationMode,
        ) as ModuleVisibility;
      }

      return {
        user: session.user,
        memberships: session.memberships,
        organization: context.organization,
        organizationId: context.organizationId,
        organizationLogoUrl,
        permissions: context.permissions,
        roleKeys: context.roleKeys,
        businessProfileKey,
        persona,
        roleSurface,
        complexity,
        dashboardCards: dashboardCardsForPersona(persona),
        modules: resolvedModules,
        workMix: preview.active && preview.workMix != null ? preview.workMix : workMix,
        suggestedDefaults:
          preview.active && preview.suggestedDefaults
            ? preview.suggestedDefaults
            : orgSettings.suggestedDefaults,
        experiencePreview: {
          allowed: previewAllowed,
          selection: preview.selection,
          active: preview.active,
          labelKey: preview.labelKey,
        },
      };
    });
  } catch (error) {
    // A revoked membership should show the org picker, not an error page.
    if (error instanceof AppError) return null;
    throw error;
  }
});

export type ShellContext = NonNullable<Awaited<ReturnType<typeof getShellContext>>>;

/** Deferred Quick Create prefs — not awaited by AppShell layout. */
export const getShellQuickCreatePrefs = cache(async () => {
  const session = await getSessionState();
  if (session.status !== 'authenticated' || !session.activeOrganizationId) return null;

  return runInOrgContext(session.user.id, session.activeOrganizationId, async (context) => {
    const [orgSettings, previewSelection] = await Promise.all([
      loadShellOrgSettings(context.db, context.organizationId),
      readExperiencePreviewCookie(),
    ]);

    const env = serverEnv();
    const previewAllowed = canUseExperiencePreview(
      context.roleKeys,
      env.APP_ENV,
      env.PF_EXPERIENCE_PREVIEW,
    );
    const preview = resolveExperiencePreview(previewAllowed ? previewSelection : 'actual');

    return {
      workMix: preview.active && preview.workMix != null ? preview.workMix : orgSettings.workMix,
      quickCreateEmphasis:
        preview.active && preview.quickCreateEmphasis
          ? preview.quickCreateEmphasis
          : orgSettings.quickCreateEmphasis,
    };
  });
});
