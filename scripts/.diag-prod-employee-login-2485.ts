/**
 * Production employee login diagnostic (READ-ONLY by default).
 * Does NOT log PIN values. Does NOT reset PIN unless --allow-prod-credential-reset.
 *
 * Set EMPLOYEE_APP_SMOKE_USERNAME for the account to inspect.
 */
import dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import {
  hasProdCredentialResetFlag,
  requireProdCredentialResetFlag,
  resolveSmokeUsername,
} from './lib/employee-app-script-safety';

const SCRIPT_NAME = '.diag-prod-employee-login-2485.ts';

dotenv.config({ path: '.env.local', override: true });
process.env.DATABASE_URL = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? '';

const PROD_ORG = process.env.PROD_SMOKE_ORG_ID ?? '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec';
const PROD_BASE = process.env.PROD_SMOKE_BASE_URL ?? 'https://proflow-two-bice.vercel.app';

function fingerprint(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 12);
}

async function findOwnerUserId(admin: Awaited<ReturnType<typeof import('@/shared/db/client')['getAdminDb']>>): Promise<string> {
  const rows = await admin.execute(sql`
    SELECT om.user_id
    FROM organization_memberships om
    JOIN role_assignments ra ON ra.membership_id = om.id
    JOIN roles r ON r.id = ra.role_id
    WHERE om.organization_id = ${PROD_ORG}::uuid
      AND om.status = 'active'
      AND r.key = 'owner'
    ORDER BY om.created_at ASC
    LIMIT 1
  `);
  const row = rows[0] as { user_id: string } | undefined;
  if (!row) throw new Error('No owner user found');
  return row.user_id;
}

async function withOwnerContext<T>(fn: (context: OrgContext) => Promise<T>): Promise<T> {
  const { getAdminDb } = await import('@/shared/db/client');
  const { resolveOrgContext } = await import('@/modules/tenancy');
  const { orgContextFromAuthzSnapshot, toOrgAuthzSnapshot } = await import('@/shared/auth/org-authz-memo');
  const { runInOrgRequestTxFrame } = await import('@/shared/auth/org-request-tx');
  const admin = getAdminDb();
  const ownerUserId = await findOwnerUserId(admin);
  const resolved = await resolveOrgContext(admin, {
    userId: ownerUserId,
    organizationId: PROD_ORG,
    locale: 'he-IL',
  });
  const snapshot = toOrgAuthzSnapshot(resolved);
  return runInOrgRequestTxFrame({ tx: admin as never, snapshot }, () =>
    fn(orgContextFromAuthzSnapshot(snapshot, { userId: ownerUserId, locale: 'he-IL', db: admin })),
  );
}

async function main(): Promise<void> {
  const username = resolveSmokeUsername();
  const report: Record<string, unknown> = { mode: 'read-only', username };

  const { getAdminDb } = await import('@/shared/db/client');
  const { findEmployeeAppAccountByUsernameGlobal, findEmployeeAppAccountSealedPinByEmployeeId } =
    await import('@/modules/employee-app/data/accounts.repository');
  const { getEmployeeAppAdminView } = await import('@/modules/employee-app');
  const { employeeSupabaseAuthPassword, employeeAuthPepperSourceFingerprint } = await import(
    '@/modules/employee-app/domain/auth-password'
  );
  const { openTemporaryPinSealed } = await import('@/modules/employee-app/domain/temporary-pin-seal');
  const { getSupabaseAdminClient } = await import('@/shared/supabase/admin');
  const { buildEmployeeLoginUrl } = await import('@/modules/employee-app/domain/credentials-share');

  report.localEnv = {
    appEnv: process.env.APP_ENV ?? null,
    pepperSourceFingerprint: employeeAuthPepperSourceFingerprint(),
    supabaseUrlHost: process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https:\/\//, '').split('.')[0] ?? null,
  };

  const admin = getAdminDb();
  const globalMatches = await admin.execute(sql`
    SELECT id, employee_id, organization_id, user_id, username, status,
           pin_must_change, temporary_pin_expires_at, locked_until, disabled_at,
           access_starts_at, access_ends_at, failed_login_count,
           temporary_pin_sealed IS NOT NULL AS has_sealed_pin
    FROM employee_app_accounts
    WHERE username_normalized = ${username}
  `);
  report.globalLookupCount = globalMatches.length;
  if (globalMatches.length !== 1) {
    report.usernameLookup = 'FAIL';
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  report.usernameLookup = 'PASS';

  const row = globalMatches[0] as Record<string, unknown>;
  const employeeId = String(row.employee_id);
  report.account = {
    employeeId,
    organizationId: row.organization_id,
    userId: row.user_id,
    status: row.status,
    pinMustChange: row.pin_must_change,
    temporaryPinExpiresAt: row.temporary_pin_expires_at,
    lockedUntil: row.locked_until,
    disabledAt: row.disabled_at,
    accessStartsAt: row.access_starts_at,
    accessEndsAt: row.access_ends_at,
    failedLoginCount: row.failed_login_count,
    hasSealedPin: row.has_sealed_pin,
  };

  const sealedRow = await findEmployeeAppAccountSealedPinByEmployeeId(admin, PROD_ORG, employeeId);
  const adminView = await withOwnerContext((ctx) => getEmployeeAppAdminView(ctx, employeeId));

  let sealedPin: string | null = null;
  try {
    sealedPin = sealedRow?.temporaryPinSealed
      ? openTemporaryPinSealed(sealedRow.temporaryPinSealed)
      : null;
  } catch {
    sealedPin = null;
  }

  report.shareableCredentialsVisible = Boolean(adminView.shareableCredentials);
  report.sealedPinPresent = Boolean(sealedPin);

  const account = await findEmployeeAppAccountByUsernameGlobal(admin, username);
  if (!account) throw new Error('account missing');

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(
    account.userId,
  );
  report.supabaseUserResolved = !authUserError && Boolean(authUser.user);
  report.supabaseUserEmailPresent = Boolean(authUser.user?.email);

  const loginUrl = buildEmployeeLoginUrl(PROD_BASE, 'he-IL', username);
  report.shareLink = {
    loginUrl,
    usesCanonicalHost: loginUrl.startsWith(`${PROD_BASE}/`),
  };

  if (hasProdCredentialResetFlag()) {
    requireProdCredentialResetFlag(SCRIPT_NAME, 'resetEmployeeAppPin');
    const { resetEmployeeAppPin } = await import('@/modules/employee-app');
    const { employeeLogin } = await import('@/modules/employee-app/application/employee-login');
    const scriptAudit = { auditMeta: { source: 'script' as const, scriptName: SCRIPT_NAME } };
    const reset = await withOwnerContext((ctx) => resetEmployeeAppPin(ctx, employeeId, scriptAudit));
    report.mode = 'credential-mutation';
    report.resetPinReturned = true;
    report.authPasswordMaterialFingerprint = fingerprint(employeeSupabaseAuthPassword(reset.temporaryPin));

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const signInClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: directSignInError } = await signInClient.auth.signInWithPassword({
      email: account.authEmail,
      password: employeeSupabaseAuthPassword(reset.temporaryPin),
    });
    report.directSupabaseSignIn = directSignInError
      ? { ok: false, code: directSignInError.code ?? 'unknown', message: directSignInError.message }
      : { ok: true };

    try {
      await employeeLogin({ username, pin: reset.temporaryPin });
      report.localEmployeeLogin = 'PASS';
    } catch (error) {
      report.localEmployeeLogin = error instanceof Error ? error.message : String(error);
    }
  } else {
    report.credentialMutation = 'SKIPPED (pass --allow-prod-credential-reset to run login probe after reset)';
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
