'use server';

import { cookies } from 'next/headers';
import { getLocale } from 'next-intl/server';
import {
  demoExitMarketingHref,
  resolveDemoBusinessProfileKey,
} from '@/modules/demo/domain/demo-session-decisions';
import { permitScopedAuthAttempt } from '@/shared/auth/consume-auth-rate-limit';
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

async function clientIp(): Promise<string> {
  const { headers } = await import('next/headers');
  const list = await headers();
  return list.get('x-forwarded-for')?.split(',')[0]?.trim() || list.get('x-real-ip') || 'unknown';
}

export async function switchDemoBusinessProfileAction(formData: FormData): Promise<void> {
  if (!isDemoEntryEnabled()) {
    throw new DomainRuleError('Demo entry is disabled', 'demo.errors.disabled');
  }
  const db = getAdminDb();
  if (!(await permitScopedAuthAttempt('demo_enter', await clientIp(), db))) {
    throw new DomainRuleError('Too many demo entries', 'demo.errors.rateLimited');
  }
  const jar = await cookies();
  const previous = openDemoSessionCookie(jar.get('demo_session')?.value);
  if (!previous) {
    throw new DomainRuleError('Demo session missing', 'demo.errors.invalidChoice');
  }
  const profileKey = resolveDemoBusinessProfileKey(formData.get('profileKey'));
  if (!profileKey) {
    throw new DomainRuleError('Unknown demo choice', 'demo.errors.invalidChoice');
  }
  const roleKey = previous.roleKey;
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
  jar.set('demo_session', sealed, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.APP_ENV === 'production',
  });
  redirect({ href: demoRoleHome(result.roleKey), locale: await getLocale() });
}

export async function switchDemoRoleInSessionAction(formData: FormData): Promise<void> {
  const jar = await cookies();
  const current = openDemoSessionCookie(jar.get('demo_session')?.value);
  if (!current) throw new DomainRuleError('Demo session missing', 'demo.errors.roleRejected');
  const roleKey = formData.get('roleKey');
  if (!isDemoRoleKey(roleKey)) {
    throw new DomainRuleError('Demo role switch rejected', 'demo.errors.roleRejected');
  }
  const result = await switchDemoRole(getAdminDb(), productionAuth(), {
    sessionId: current.sessionId,
    body: { roleKey },
  });
  const sealed = sealDemoSessionCookie({ ...current, roleKey: result.roleKey as typeof current.roleKey });
  if (!sealed) throw new DomainRuleError('Demo cookie secret is missing', 'demo.errors.notConfigured');
  jar.set('demo_session', sealed, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.APP_ENV === 'production',
  });
  redirect({ href: demoRoleHome(result.roleKey as typeof current.roleKey), locale: await getLocale() });
}

/** Signs out demo auth only; does not delete organizations or demo users. */
export async function exitDemoAction(): Promise<void> {
  const jar = await cookies();
  jar.delete('demo_session');
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect({ href: demoExitMarketingHref(), locale: await getLocale() });
}