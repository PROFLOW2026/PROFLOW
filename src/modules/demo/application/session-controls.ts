'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import {
  demoExitMarketingHref,
  planDemoSessionApply,
  resolveDemoBusinessProfileKey,
} from '@/modules/demo/domain/demo-session-decisions';
import { getAdminDb } from '@/shared/db/client';
import { DomainRuleError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from '@/shared/supabase/admin';
import { createSupabaseServerClient, isSupabaseConfigured } from '@/shared/supabase/server';
import { demoRoleHome } from '@/modules/demo/domain/demo-roles';
import { isDemoRoleKey } from '@/modules/demo/domain/demo-org';
import { enterDemo, type DemoAuthPort } from './enter-demo';
import { isDemoEntryEnabled } from './flags';
import { openDemoSessionCookie, sealDemoSessionCookie } from './session-cookie';
import { switchDemoRole } from './switch-role';
import { redirectWithDemoEntryError } from './map-demo-entry-error';

function productionAuth(): DemoAuthPort {
  return {
    async createConfirmedUser(email) {
      if (!isSupabaseAdminConfigured()) {
        throw new DomainRuleError('Auth admin is not configured', 'demo.errors.notConfigured');
      }
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { demo: true },
      });
      if (error || !data.user) {
        throw new DomainRuleError(error?.message ?? 'create user failed', 'demo.errors.notConfigured');
      }
      return { userId: data.user.id };
    },
    async signIn(email) {
      if (!isSupabaseAdminConfigured()) {
        throw new DomainRuleError('Auth admin is not configured', 'demo.errors.notConfigured');
      }
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const hashed = data?.properties?.hashed_token;
      if (error || !hashed) {
        throw new DomainRuleError('Demo sign-in has no token', 'demo.errors.signInUnsafe');
      }
      const supabase = await createSupabaseServerClient();
      const verified = await supabase.auth.verifyOtp({ token_hash: hashed, type: 'magiclink' });
      if (verified.error || !verified.data.user) {
        throw new DomainRuleError(verified.error?.message ?? 'verify failed', 'demo.errors.signInUnsafe');
      }
      return { userId: verified.data.user.id, emailSent: false, exposedSecret: false };
    },
    async deleteUser(userId) {
      if (!isSupabaseAdminConfigured()) return;
      const admin = getSupabaseAdminClient();
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

function writeDemoSessionCookie(
  jar: Awaited<ReturnType<typeof cookies>>,
  value: string,
): void {
  jar.set('demo_session', value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.APP_ENV === 'production',
  });
}

/** Applies the business and role selectors together. An unchanged pair does not create a session. */
export async function applyDemoSessionChoicesAction(formData: FormData): Promise<void> {
  try {
    if (!isDemoEntryEnabled()) {
      throw new DomainRuleError('Demo entry is disabled', 'demo.errors.disabled');
    }
    const db = getAdminDb();
    const jar = await cookies();
    const previous = openDemoSessionCookie(jar.get('demo_session')?.value);
    if (!previous) {
      throw new DomainRuleError('Demo session missing', 'demo.errors.invalidChoice');
    }
    const profileKey = resolveDemoBusinessProfileKey(formData.get('profileKey'));
    const roleKey = formData.get('roleKey');
    if (!profileKey || !isDemoRoleKey(roleKey)) {
      throw new DomainRuleError('Unknown demo choice', 'demo.errors.invalidChoice');
    }
    const plan = planDemoSessionApply({
      currentProfileKey: previous.profileKey,
      currentRoleKey: previous.roleKey,
      nextProfileKey: profileKey,
      nextRoleKey: roleKey,
    });
    const locale = await getLocale();
    if (plan === 'none') {
      redirect({ href: demoRoleHome(previous.roleKey), locale });
    }
    if (plan === 'switch-role') {
      const result = await switchDemoRole(db, productionAuth(), {
        sessionId: previous.sessionId,
        body: { roleKey },
      });
      const sealed = sealDemoSessionCookie({
        ...previous,
        roleKey: result.roleKey as typeof previous.roleKey,
      });
      if (!sealed) throw new DomainRuleError('Demo cookie secret is missing', 'demo.errors.notConfigured');
      writeDemoSessionCookie(jar, sealed);
      redirect({ href: demoRoleHome(result.roleKey as typeof previous.roleKey), locale });
    }
    const result = await enterDemo(db, productionAuth(), {
      profileKey,
      roleKey,
      previousSessionId: previous.sessionId,
    });
    const sealed = sealDemoSessionCookie({
      sessionId: result.sessionId,
      profileKey: result.profileKey,
      roleKey: result.roleKey,
    });
    if (!sealed) throw new DomainRuleError('Demo cookie secret is missing', 'demo.errors.notConfigured');
    writeDemoSessionCookie(jar, sealed);
    redirect({ href: demoRoleHome(result.roleKey), locale });
  } catch (error) {
    await redirectWithDemoEntryError(error);
  }
}

/** Signs out demo auth only; does not delete organizations or demo users. */
export async function exitDemoAction(): Promise<void> {
  try {
    const jar = await cookies();
    jar.delete('demo_session');
    if (isSupabaseConfigured()) {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    }
    redirect({ href: demoExitMarketingHref(), locale: await getLocale() });
  } catch (error) {
    await redirectWithDemoEntryError(error);
  }
}