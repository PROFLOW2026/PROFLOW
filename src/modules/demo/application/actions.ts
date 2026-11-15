"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { permitScopedAuthAttempt } from "@/shared/auth/consume-auth-rate-limit";
import { getAdminDb } from "@/shared/db/client";
import { DomainRuleError } from "@/shared/errors";
import { redirect } from "@/shared/i18n/navigation";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/shared/supabase/admin";
import { createSupabaseServerClient } from "@/shared/supabase/server";
import { enterDemo, type DemoAuthPort } from "./enter-demo";
import { switchDemoRole } from "./switch-role";
import { isDemoEntryEnabled } from "./flags";
import { openDemoSessionCookie, sealDemoSessionCookie } from "./session-cookie";

function productionAuth(): DemoAuthPort {
  return {
    async createConfirmedUser(email) {
      if (!isSupabaseAdminConfigured()) {
        throw new DomainRuleError("Auth admin is not configured", "demo.errors.notConfigured");
      }
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { demo: true },
      });
      if (error || !data.user) {
        throw new DomainRuleError(error?.message ?? "create user failed", "demo.errors.notConfigured");
      }
      return { userId: data.user.id };
    },
    async signIn(email) {
      if (!isSupabaseAdminConfigured()) {
        throw new DomainRuleError("Auth admin is not configured", "demo.errors.notConfigured");
      }
      const admin = getSupabaseAdminClient();
      const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const hashed = data?.properties?.hashed_token;
      if (error || !hashed) {
        throw new DomainRuleError("Demo sign-in has no token", "demo.errors.signInUnsafe");
      }
      const supabase = await createSupabaseServerClient();
      const verified = await supabase.auth.verifyOtp({ token_hash: hashed, type: "magiclink" });
      if (verified.error || !verified.data.user) {
        throw new DomainRuleError(verified.error?.message ?? "verify failed", "demo.errors.signInUnsafe");
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
  const { headers } = await import("next/headers");
  const list = await headers();
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "unknown";
}

export async function enterDemoAction(formData: FormData): Promise<void> {
  if (!isDemoEntryEnabled()) {
    throw new DomainRuleError("Demo entry is disabled", "demo.errors.disabled");
  }
  const db = getAdminDb();
  if (!(await permitScopedAuthAttempt("demo_enter", await clientIp(), db))) {
    throw new DomainRuleError("Too many demo entries", "demo.errors.rateLimited");
  }
  const jar = await cookies();
  const previous = openDemoSessionCookie(jar.get("demo_session")?.value);
  const result = await enterDemo(db, productionAuth(), {
    profileKey: String(formData.get("profileKey") ?? ""),
    roleKey: String(formData.get("roleKey") ?? ""),
    previousSessionId: previous?.sessionId ?? null,
  });
  const sealed = sealDemoSessionCookie({
    sessionId: result.sessionId,
    profileKey: result.profileKey,
    roleKey: result.roleKey,
  });
  if (!sealed) throw new DomainRuleError("Demo cookie secret is missing", "demo.errors.notConfigured");
  jar.set("demo_session", sealed, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.APP_ENV === "production" });
  const locale = await getLocale();
  const href = result.roleKey === "employee" ? "/employee" : result.roleKey === "contractor" ? "/contractor" : "/";
  redirect({ href, locale });
}

export async function switchDemoRoleAction(formData: FormData): Promise<void> {
  const jar = await cookies();
  const current = openDemoSessionCookie(jar.get("demo_session")?.value);
  if (!current) throw new DomainRuleError("Demo session missing", "demo.errors.roleRejected");
  const body: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) body[key] = value;
  const result = await switchDemoRole(getAdminDb(), productionAuth(), { sessionId: current.sessionId, body });
  const sealed = sealDemoSessionCookie({ ...current, roleKey: result.roleKey as typeof current.roleKey });
  if (!sealed) throw new DomainRuleError("Demo cookie secret is missing", "demo.errors.notConfigured");
  jar.set("demo_session", sealed, { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.APP_ENV === "production" });
  const locale = await getLocale();
  const href = result.roleKey === "employee" ? "/employee" : result.roleKey === "contractor" ? "/contractor" : "/";
  redirect({ href, locale });
}
